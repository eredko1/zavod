// Empty fields are missing measurements; an explicit zero is valid.
export function sourceNumber(value) {
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;
  const number=Number(value);return Number.isFinite(number)?number:null;
}
