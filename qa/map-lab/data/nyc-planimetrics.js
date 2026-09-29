// Original services complement the Socrata exports of the same survey, not independent observations.
const ROOT='https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/';
export const PLANIMETRIC_SOURCES=[
  ['nyc-transport-2022','Transport_Structure_2022',25,'Transport structures','esriGeometryPolygon',true,'deck-outline'],
  ['nyc-rail-structures-2022','Railroad_Structure_2022',18,'Rail structures','esriGeometryPolygon',true,'rail-structure-outline'],
  ['nyc-railroad-2022','Railroad_2022',17,'Railroad lines','esriGeometryPolyline',true,'rail-alignment'],
  ['nyc-curbs-2022','Curb_2022',4,'Curbs','esriGeometryPolyline',true,'curb-line'],
  ['nyc-pavement-2022','Pavement_Edge_2022',14,'Pavement edges','esriGeometryPolyline',true,'pavement-edge'],
  ['nyc-retaining-walls-2022','Retaining_Wall_2022',19,'Retaining walls','esriGeometryPolyline',true,'retaining-wall-line'],
  ['nyc-curb-cuts-2022','Curb_Cut_2022',5,'Curb cuts','esriGeometryPolyline',true,'curb-cut-line'],
  ['nyc-cooling-towers-2022','Cooling_Towers_2022',3,'Cooling towers','esriGeometryPolygon',false,'cooling-equipment-outline'],
  ['nyc-misc-structures-2022','Miscellaneous_Structure_Polygon_2022',10,'Miscellaneous structures','esriGeometryPolygon',false,'misc-structure-outline'],
  ['nyc-parking-2022','Parking_Lot_2022',13,'Parking lots','esriGeometryPolygon',false,'parking-outline'],
  ['nyc-plazas-2022','Plaza_2022',16,'Plazas','esriGeometryPolygon',false,'plaza-outline'],
  ['nyc-parks-2022','Park_2022',12,'Parks','esriGeometryPolygon',false,'park-outline'],
  ['nyc-open-space-2022','Open_Space_No_Park_2022',11,'Open space','esriGeometryPolygon',false,'open-space-outline'],
  ['nyc-sidewalk-lines-2022','Sidewalk_Line_2022',23,'Sidewalk lines','esriGeometryPolyline',false,'sidewalk-line'],
  ['nyc-pools-2022','Swimming_Pool_2022',24,'Swimming pools','esriGeometryPolygon',false,'pool-outline'],
  ['nyc-construction-2022','Under_Construction_Unknown_2022',26,'Construction areas','esriGeometryPolygon',false,'construction-outline'],
  ['nyc-pavement-carto-2022','Pavement_Edge_Carto_2022',15,'Cartographic pavement edges','esriGeometryPolyline',true,'pavement-carto-line',{idField:'OBJECTID_1',requiredFields:['OBJECTID','Z_CENTER','Z_START','Z_END','STATUS','GlobalID']}],
].map(([id,service,number,name,geometryType,hasZ,sourceRole,schema={}])=>({id,dataset:service,name:'NYC 2022 '+name.toLowerCase(),color:hasZ?'#b5a7dc':'#d6b68c',kind:'planimetric-reference',idField:'OBJECTID',api:'arcgis-features',layer:ROOT+service+'/FeatureServer/'+number,geometryType,requiredFields:['SOURCE_ID','FEATURE_CODE','SUB_FEATURE_CODE','STATUS','GlobalID',...(sourceRole==='cooling-equipment-outline'?['BIN']:sourceRole==='misc-structure-outline'?['DESCRIPTION']:[])],...schema,nativeGeometry:true,nativeHasZ:hasZ,captureYear:2022,verticalCRS:'NAVD88',surveyFamily:'NYC-2022-planimetrics',sourceRole,captureRules:'https://github.com/CityOfNewYork/nyc-planimetrics/blob/main/Capture_Rules.md'}));
