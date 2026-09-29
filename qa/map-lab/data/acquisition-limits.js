// Coverage budgets, not sampling settings. API batch sizes and protocol constraints stay separate.
const MiB=1024*1024;
export const ACQUISITION_LIMITS=Object.freeze({
  areaMetres:10000,
  vectorRecords:50000,
  mesh:Object.freeze({nodes:8000,leaves:1200,features:40000,vertices:12000000,bytes:512*MiB}),
  lidar:Object.freeze({assets:4096,hierarchyPages:1024,points:150000000,bytes:1024*MiB,decodedBytes:5120*MiB}),
});
