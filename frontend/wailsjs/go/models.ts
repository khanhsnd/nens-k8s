export namespace domain {
	
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

}

