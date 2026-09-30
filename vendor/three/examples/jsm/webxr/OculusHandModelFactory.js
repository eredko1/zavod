import { XRHandModelFactory } from './XRHandModelFactory.js';
import { OculusHandModel } from './OculusHandModel.js';

class OculusHandModelFactory {
	constructor( gltfLoader = null, onLoad = null ) {
		this.gltfLoader = gltfLoader;
		this.onLoad = onLoad;
		this.path = null;
		this._factory = new XRHandModelFactory( gltfLoader, onLoad );
	}

	setPath( path ) {
		this.path = path;
		this._factory.setPath( path );
		return this;
	}

	createHandModel( controller, profile = 'boxes' ) {
		return this._factory.createHandModel( controller, profile );
	}
}

export { OculusHandModelFactory };
