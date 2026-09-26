import * as echarts from '../../../vendor/echarts/echarts.esm.min.js';
import { CPU_STAGES, FRAME_LIMIT_MS, activityName, activitySummary } from './frame-chart-data.js';

const target=axis=>({silent:true,symbol:'none',lineStyle:{color:'#ff626d',width:2,type:'solid'},label:{formatter:'60 FPS · 16.67 ms',color:'#ff8991',position:axis==='xAxis'?'insideEndTop':'insideEndBottom'},data:[{[axis]:FRAME_LIMIT_MS}]});
const legend={type:'scroll',top:4,itemWidth:16,itemHeight:10,itemGap:8,textStyle:{color:'#d8e6ee',fontSize:11},inactiveColor:'#647580',pageTextStyle:{color:'#d8e6ee'},pageIconColor:'#d8e6ee'};
const tooltip={trigger:'axis',confine:true,valueFormatter:v=>typeof v==='number'?`${v.toFixed(2)} ms`:'Unavailable'};
const durationLabel={formatter:value=>String(+value.toFixed(1))};
const base={animation:false,backgroundColor:'transparent',textStyle:{color:'#d8e6ee'},aria:{enabled:true},tooltip};
const instances=new WeakMap();
export function disposeCharts(root) { instances.get(root)?.();instances.delete(root); }

export function mountCharts(report, {root,overview,filter,timeline,select}) {
  disposeCharts(root);
  const bars=echarts.init(overview,null,{renderer:'svg'}),lines=echarts.init(timeline,null,{renderer:'svg'});
  const modes=report.config.modes, summaries=modes.map(mode=>activitySummary(report,mode));
  function drawOverview(){
    const rows=summaries.filter(s=>filter.value==='all'||s.mode===filter.value),max=Math.max(FRAME_LIMIT_MS*1.2,...rows.flatMap(s=>[s.cpu||0,s.gpu.p95||0]))*1.1;
    overview.style.height=`${80+rows.length*52}px`;
    bars.setOption({...base,legend:{...legend,data:[...CPU_STAGES.map(s=>s[1]),'GPU render']},grid:{left:102,right:32,top:36,bottom:36},
      xAxis:{type:'value',name:'Milliseconds',max,axisLabel:durationLabel,splitLine:{lineStyle:{color:'#30434f'}}},
      yAxis:{type:'category',inverse:true,data:rows.map(s=>activityName(s.mode)),axisLabel:{color:'#d8e6ee',fontSize:12}},
      series:[...CPU_STAGES.map(([key,name,color],index)=>({id:key,name,type:'bar',stack:'cpu',barMaxWidth:14,itemStyle:{color},data:rows.map(s=>s.parts[index])})),
        {name:'GPU render',type:'bar',stack:'gpu',barMaxWidth:14,itemStyle:{color:'#f48bce'},data:rows.map(s=>s.gpu.p95),label:{show:true,position:'right',color:'#f4bde2',formatter:p=>p.value==null?'':`${p.value.toFixed(2)} ms`}},
        {name:'Frame limit',type:'line',data:[],markLine:target('xAxis')}],
    },{replaceMerge:['series']});bars.resize();
  }
  const drawTimeline=()=>{
    const [repeat,mode]=select.value.split('|'),run=report.runs.find(r=>r.repeat===Number(repeat)),frames=run.raw.frames.filter(f=>f.phase===mode);
    lines.setOption({...base,legend:{...legend,data:['CPU work','GPU work','Frame spacing'],selected:{'Frame spacing':false}},grid:{left:48,right:25,top:36,bottom:48},
      xAxis:{type:'category',name:'Frame',data:frames.map((_,i)=>i+1),boundaryGap:false},yAxis:{type:'value',name:'Duration (ms)',min:0,max:value=>Math.max(20,value.max*1.1),axisLabel:durationLabel,splitLine:{lineStyle:{color:'#30434f'}}},
      dataZoom:[{type:'inside',filterMode:'none'},{type:'slider',height:12,bottom:6,borderColor:'#40515e',textStyle:{color:'#d8e6ee'}}],
      series:[['CPU work','#5cd0ef',f=>f.cpu.loop],['GPU work','#f48bce',f=>f.gpuMs],['Frame spacing','#92a4b6',f=>f.intervalMs]].map(([name,color,value])=>({name,type:'line',showSymbol:frames.length<=2,symbolSize:5,connectNulls:false,itemStyle:{color},data:frames.map(value)})).concat({name:'Frame limit',type:'line',data:[],markLine:target('yAxis')}),
    },true);
  };
  const resize=new ResizeObserver(()=>{if(overview.clientWidth)bars.resize();if(timeline.clientWidth)lines.resize();});resize.observe(overview);resize.observe(timeline);
  filter.onchange=drawOverview;select.onchange=drawTimeline;drawOverview();drawTimeline();
  instances.set(root,()=>{resize.disconnect();bars.dispose();lines.dispose();filter.onchange=select.onchange=null;});
}
