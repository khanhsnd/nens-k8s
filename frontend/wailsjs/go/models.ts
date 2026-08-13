export namespace domain {
	
	export class PrinterColumn {
	    name: string;
	    type: string;
	    jsonPath: string;
	    priority: number;
	    description?: string;
	
	    static createFrom(source: any = {}) {
	        return new PrinterColumn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.jsonPath = source["jsonPath"];
	        this.priority = source["priority"];
	        this.description = source["description"];
	    }
	}
	export class GVR {
	    group: string;
	    version: string;
	    resource: string;
	
	    static createFrom(source: any = {}) {
	        return new GVR(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.group = source["group"];
	        this.version = source["version"];
	        this.resource = source["resource"];
	    }
	}
	export class APIResource {
	    gvr: GVR;
	    kind: string;
	    namespaced: boolean;
	    custom: boolean;
	    verbs: string[];
	    shortNames?: string[];
	    columns?: PrinterColumn[];
	
	    static createFrom(source: any = {}) {
	        return new APIResource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gvr = this.convertValues(source["gvr"], GVR);
	        this.kind = source["kind"];
	        this.namespaced = source["namespaced"];
	        this.custom = source["custom"];
	        this.verbs = source["verbs"];
	        this.shortNames = source["shortNames"];
	        this.columns = this.convertValues(source["columns"], PrinterColumn);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Cluster {
	    id: string;
	    name: string;
	    context: string;
	    server: string;
	    user: string;
	    namespace: string;
	    phase: string;
	    version: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new Cluster(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.context = source["context"];
	        this.server = source["server"];
	        this.user = source["user"];
	        this.namespace = source["namespace"];
	        this.phase = source["phase"];
	        this.version = source["version"];
	        this.error = source["error"];
	    }
	}
	export class ContainerTarget {
	    namespace: string;
	    pod: string;
	    container: string;
	    role: string;
	    state: string;
	    restarts: number;
	
	    static createFrom(source: any = {}) {
	        return new ContainerTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.namespace = source["namespace"];
	        this.pod = source["pod"];
	        this.container = source["container"];
	        this.role = source["role"];
	        this.state = source["state"];
	        this.restarts = source["restarts"];
	    }
	}
	export class EventRecord {
	    type: string;
	    reason: string;
	    message: string;
	    source: string;
	    count: number;
	    last: string;
	
	    static createFrom(source: any = {}) {
	        return new EventRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.reason = source["reason"];
	        this.message = source["message"];
	        this.source = source["source"];
	        this.count = source["count"];
	        this.last = source["last"];
	    }
	}
	export class ExecOptions {
	    command: string[];
	    tty: boolean;
	    cols: number;
	    rows: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.tty = source["tty"];
	        this.cols = source["cols"];
	        this.rows = source["rows"];
	    }
	}
	export class ForwardPort {
	    name: string;
	    port: number;
	    protocol: string;
	
	    static createFrom(source: any = {}) {
	        return new ForwardPort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.port = source["port"];
	        this.protocol = source["protocol"];
	    }
	}
	
	export class HelmRelease {
	    clusterId: string;
	    namespace: string;
	    name: string;
	    revision: number;
	    status: string;
	    chart: string;
	    chartVersion: string;
	    appVersion: string;
	    updated: string;
	    description?: string;
	
	    static createFrom(source: any = {}) {
	        return new HelmRelease(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clusterId = source["clusterId"];
	        this.namespace = source["namespace"];
	        this.name = source["name"];
	        this.revision = source["revision"];
	        this.status = source["status"];
	        this.chart = source["chart"];
	        this.chartVersion = source["chartVersion"];
	        this.appVersion = source["appVersion"];
	        this.updated = source["updated"];
	        this.description = source["description"];
	    }
	}
	export class HelmDetail {
	    release: HelmRelease;
	    values: string;
	    manifest: string;
	    notes?: string;
	
	    static createFrom(source: any = {}) {
	        return new HelmDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.release = this.convertValues(source["release"], HelmRelease);
	        this.values = source["values"];
	        this.manifest = source["manifest"];
	        this.notes = source["notes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HelmRef {
	    clusterId: string;
	    namespace: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new HelmRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clusterId = source["clusterId"];
	        this.namespace = source["namespace"];
	        this.name = source["name"];
	    }
	}
	
	export class KubeconfigFile {
	    path: string;
	    contexts: number;
	    removable: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new KubeconfigFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.contexts = source["contexts"];
	        this.removable = source["removable"];
	        this.error = source["error"];
	    }
	}
	export class LogOptions {
	    follow: boolean;
	    tailLines: number;
	    sinceSeconds: number;
	    timestamps: boolean;
	    previous: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LogOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.follow = source["follow"];
	        this.tailLines = source["tailLines"];
	        this.sinceSeconds = source["sinceSeconds"];
	        this.timestamps = source["timestamps"];
	        this.previous = source["previous"];
	    }
	}
	export class Usage {
	    name: string;
	    namespace?: string;
	    cpuMilli: number;
	    memoryBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new Usage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.cpuMilli = source["cpuMilli"];
	        this.memoryBytes = source["memoryBytes"];
	    }
	}
	export class MetricsSample {
	    clusterId: string;
	    available: boolean;
	    error?: string;
	    nodes: Usage[];
	    pods: Usage[];
	
	    static createFrom(source: any = {}) {
	        return new MetricsSample(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clusterId = source["clusterId"];
	        this.available = source["available"];
	        this.error = source["error"];
	        this.nodes = this.convertValues(source["nodes"], Usage);
	        this.pods = this.convertValues(source["pods"], Usage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OwnerRef {
	    gvr: GVR;
	    kind: string;
	    name: string;
	    namespace: string;
	    uid: string;
	
	    static createFrom(source: any = {}) {
	        return new OwnerRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gvr = this.convertValues(source["gvr"], GVR);
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.uid = source["uid"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PortForward {
	    id: string;
	    clusterId: string;
	    namespace: string;
	    resource: string;
	    name: string;
	    pod: string;
	    localPort: number;
	    remotePort: number;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PortForward(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.clusterId = source["clusterId"];
	        this.namespace = source["namespace"];
	        this.resource = source["resource"];
	        this.name = source["name"];
	        this.pod = source["pod"];
	        this.localPort = source["localPort"];
	        this.remotePort = source["remotePort"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}
	
	export class ResourceRef {
	    clusterId: string;
	    gvr: GVR;
	    namespace: string;
	    name: string;
	    uid: string;
	
	    static createFrom(source: any = {}) {
	        return new ResourceRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clusterId = source["clusterId"];
	        this.gvr = this.convertValues(source["gvr"], GVR);
	        this.namespace = source["namespace"];
	        this.name = source["name"];
	        this.uid = source["uid"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Subscription {
	    token: string;
	    clusterId: string;
	    gvr: GVR;
	    namespace: string;
	
	    static createFrom(source: any = {}) {
	        return new Subscription(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.clusterId = source["clusterId"];
	        this.gvr = this.convertValues(source["gvr"], GVR);
	        this.namespace = source["namespace"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateStatus {
	    current: string;
	    latest: string;
	    available: boolean;
	    canInstall: boolean;
	    page: string;
	    development: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.available = source["available"];
	        this.canInstall = source["canInstall"];
	        this.page = source["page"];
	        this.development = source["development"];
	    }
	}

}

