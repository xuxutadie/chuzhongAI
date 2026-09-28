/** 只接收可安全渲染的已保存题图；不把缺失图片解释成没有配图。 */
export function previewDiagram(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.width) || value.width <= 0 ||
      !Number.isFinite(value.height) || value.height <= 0 || typeof value.alt !== 'string' || !Array.isArray(value.elements)) return null;
  const fields={line:['x1','y1','x2','y2'],text:['x','y'],circle:['cx','cy','r'],sector:['cx','cy','r','startAngle','endAngle']};
  const valid=value.elements.every(item=>{
    if (!item || typeof item !== 'object') return false;
    if (item.fill !== undefined && typeof item.fill !== 'string') return false;
    if (item.kind==='polygon') return Array.isArray(item.points) && item.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
    return Boolean(fields[item.kind]) && fields[item.kind].every(k=>Number.isFinite(item[k])) &&
      (item.kind!=='text'||typeof item.text==='string');
  });
  return valid ? value : null;
}
