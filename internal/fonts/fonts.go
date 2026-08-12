// Package fonts lists the font families installed on this machine. There is no
// portable OS call for that, so it reads the `name` table out of every font file
// in the OS font directories.
package fonts

import (
	"encoding/binary"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"unicode"
	"unicode/utf16"
)

const (
	// 'ttcf' marks a collection: several fonts sharing one file.
	collectionTag = 0x74746366

	platformMac = 1

	// The typographic family groups every weight of a face under one name
	// ("Segoe UI"); the legacy one splits them ("Segoe UI Semibold").
	nameIDFamily      = 1
	nameIDTypographic = 16

	maxRead   = 1 << 20
	maxTables = 512
	maxFonts  = 1024
)

var fontExtensions = []string{".ttf", ".ttc", ".otf", ".otc"}

type Source struct {
	mu       sync.Mutex
	families []string
}

func NewSource() *Source {
	return &Source{}
}

// Families is cached: the answer only changes when fonts are installed, and the
// scan opens a few hundred files.
func (s *Source) Families() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.families != nil {
		return slices.Clone(s.families), nil
	}

	found := make(map[string]struct{})
	for _, dir := range directories() {
		collect(dir, found)
	}
	if len(found) == 0 {
		return nil, fmt.Errorf("no readable fonts in %v", directories())
	}

	s.families = slices.Collect(maps.Keys(found))
	slices.SortFunc(s.families, func(a string, b string) int {
		return strings.Compare(strings.ToLower(a), strings.ToLower(b))
	})
	return slices.Clone(s.families), nil
}

func directories() []string {
	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "windows":
		return []string{
			filepath.Join(os.Getenv("SystemRoot"), "Fonts"),
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "Fonts"),
		}
	case "darwin":
		return []string{
			"/System/Library/Fonts",
			"/Library/Fonts",
			filepath.Join(home, "Library", "Fonts"),
		}
	default:
		return []string{
			"/usr/share/fonts",
			"/usr/local/share/fonts",
			filepath.Join(home, ".local", "share", "fonts"),
			filepath.Join(home, ".fonts"),
		}
	}
}

// collect ignores every failure: an unreadable font file is one missing name in
// a picker, not an error worth failing the whole list for.
func collect(dir string, into map[string]struct{}) {
	_ = filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !slices.Contains(fontExtensions, strings.ToLower(filepath.Ext(path))) {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()

		for _, name := range Families(file) {
			into[name] = struct{}{}
		}
		return nil
	})
}

// Families reads the family name of every font in one font file.
func Families(r io.ReaderAt) []string {
	head, err := read(r, 0, 12)
	if err != nil {
		return nil
	}

	if binary.BigEndian.Uint32(head) != collectionTag {
		if name := familyAt(r, 0); name != "" {
			return []string{name}
		}
		return nil
	}

	count := int(binary.BigEndian.Uint32(head[8:]))
	if count > maxFonts {
		return nil
	}
	offsets, err := read(r, 12, count*4)
	if err != nil {
		return nil
	}

	names := make([]string, 0, count)
	for i := range count {
		if name := familyAt(r, int64(binary.BigEndian.Uint32(offsets[i*4:]))); name != "" {
			names = append(names, name)
		}
	}
	return names
}

// familyAt walks the table directory of the font starting at `at` to its name table.
func familyAt(r io.ReaderAt, at int64) string {
	header, err := read(r, at, 12)
	if err != nil {
		return ""
	}

	tables := int(binary.BigEndian.Uint16(header[4:]))
	if tables > maxTables {
		return ""
	}
	records, err := read(r, at+12, tables*16)
	if err != nil {
		return ""
	}

	for i := range tables {
		record := records[i*16:]
		if string(record[:4]) == "name" {
			return familyIn(r, int64(binary.BigEndian.Uint32(record[8:])))
		}
	}
	return ""
}

func familyIn(r io.ReaderAt, at int64) string {
	header, err := read(r, at, 6)
	if err != nil {
		return ""
	}

	count := int(binary.BigEndian.Uint16(header[2:]))
	pool := at + int64(binary.BigEndian.Uint16(header[4:]))
	records, err := read(r, at+6, count*12)
	if err != nil {
		return ""
	}

	best, bestID := "", 0
	for i := range count {
		record := records[i*12:]
		nameID := int(binary.BigEndian.Uint16(record[6:]))
		if nameID != nameIDFamily && nameID != nameIDTypographic {
			continue
		}
		if best != "" && nameID <= bestID {
			continue
		}

		raw, err := read(r,
			pool+int64(binary.BigEndian.Uint16(record[10:])),
			int(binary.BigEndian.Uint16(record[8:])),
		)
		if err != nil {
			continue
		}
		if name := decode(binary.BigEndian.Uint16(record), raw); usable(name) {
			best, bestID = name, nameID
		}
	}
	return best
}

func decode(platform uint16, raw []byte) string {
	if platform == platformMac {
		// MacRoman and ASCII agree on the characters a family name is made of.
		return strings.TrimSpace(string(raw))
	}

	units := make([]uint16, 0, len(raw)/2)
	for i := 0; i+1 < len(raw); i += 2 {
		units = append(units, binary.BigEndian.Uint16(raw[i:]))
	}
	return strings.TrimSpace(string(utf16.Decode(units)))
}

// usable drops the names CSS cannot use: Windows lists a "@Family" rotated variant
// of every CJK font, and macOS hides system faces behind a leading dot.
func usable(name string) bool {
	if name == "" || strings.HasPrefix(name, ".") || strings.HasPrefix(name, "@") {
		return false
	}
	for _, r := range name {
		if !unicode.IsPrint(r) {
			return false
		}
	}
	return true
}

func read(r io.ReaderAt, at int64, n int) ([]byte, error) {
	if at < 0 || n <= 0 || n > maxRead {
		return nil, fmt.Errorf("refusing to read %d bytes at %d", n, at)
	}

	buffer := make([]byte, n)
	if _, err := r.ReadAt(buffer, at); err != nil {
		return nil, err
	}
	return buffer, nil
}
