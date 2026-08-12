package fonts

import (
	"bytes"
	"encoding/binary"
	"testing"
	"unicode/utf16"
)

type nameRecord struct {
	platform uint16
	nameID   uint16
	value    string
}

// font builds the smallest file Families can read: a table directory holding one
// `name` table with the given records.
func font(records ...nameRecord) []byte {
	pool := new(bytes.Buffer)
	table := new(bytes.Buffer)

	put := func(values ...uint16) {
		for _, value := range values {
			_ = binary.Write(table, binary.BigEndian, value)
		}
	}
	put(0, uint16(len(records)), uint16(6+len(records)*12))

	for _, record := range records {
		encoded := []byte(record.value)
		if record.platform != platformMac {
			encoded = nil
			for _, unit := range utf16.Encode([]rune(record.value)) {
				encoded = binary.BigEndian.AppendUint16(encoded, unit)
			}
		}
		put(record.platform, 0, 0, record.nameID, uint16(len(encoded)), uint16(pool.Len()))
		pool.Write(encoded)
	}

	name := append(table.Bytes(), pool.Bytes()...)

	out := new(bytes.Buffer)
	_ = binary.Write(out, binary.BigEndian, uint32(0x00010000))
	_ = binary.Write(out, binary.BigEndian, uint16(1))
	out.Write(make([]byte, 6))
	out.WriteString("name")
	_ = binary.Write(out, binary.BigEndian, uint32(0))
	_ = binary.Write(out, binary.BigEndian, uint32(28))
	_ = binary.Write(out, binary.BigEndian, uint32(len(name)))
	out.Write(name)

	return out.Bytes()
}

func TestFamiliesPrefersTheTypographicName(t *testing.T) {
	raw := font(
		nameRecord{platform: platformMac, nameID: nameIDFamily, value: "Nens Sans Semibold"},
		nameRecord{platform: 3, nameID: nameIDTypographic, value: "Nens Sans"},
	)

	found := Families(bytes.NewReader(raw))
	if len(found) != 1 || found[0] != "Nens Sans" {
		t.Fatalf("families = %q, want [Nens Sans]", found)
	}
}

func TestFamiliesFallsBackToTheLegacyName(t *testing.T) {
	raw := font(nameRecord{platform: 3, nameID: nameIDFamily, value: "Nens Mono"})

	found := Families(bytes.NewReader(raw))
	if len(found) != 1 || found[0] != "Nens Mono" {
		t.Fatalf("families = %q, want [Nens Mono]", found)
	}
}

func TestFamiliesIgnoresWhatItCannotRead(t *testing.T) {
	cases := map[string][]byte{
		"empty":     {},
		"truncated": font(nameRecord{platform: 3, nameID: nameIDFamily, value: "Nens Mono"})[:20],
		"rotated":   font(nameRecord{platform: 3, nameID: nameIDFamily, value: "@Nens CJK"}),
	}

	for name, raw := range cases {
		if found := Families(bytes.NewReader(raw)); len(found) != 0 {
			t.Errorf("%s: families = %q, want none", name, found)
		}
	}
}
