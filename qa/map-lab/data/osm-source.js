import { fetchJSON } from './api-request.js';
export async function queryOSM(query, endpoint, signal, onRetry) {
  if(!query.trim())throw Error('Enter a query first.');
  if(query.includes('{{'))throw Error('Use plain Overpass QL with numeric coordinates; remove Turbo {{…}} shortcuts.');
  const data=await fetchJSON(endpoint,{method:'POST',body:new URLSearchParams({data:query}),signal},onRetry);
  if(data.remark)throw Error(`API reported an incomplete result: ${data.remark}`);
  if(!Array.isArray(data.elements))throw Error('Response has no elements array. Use [out:json] and out geom;.');
  return data;
}
