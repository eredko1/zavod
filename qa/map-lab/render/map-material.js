import * as THREE from '../../../vendor/three/build/three.module.js';

// Untextured inspection geometry uses diffuse vertex lighting; source fidelity is unchanged.
export function mapMaterial(color,side=THREE.FrontSide){return new THREE.MeshLambertMaterial({color,side});}
