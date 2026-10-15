const $=id=>document.getElementById(id),canvas=$('view'),video=$('video'),orb=$('orb');
let gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:false}),stream=null,detector=null,vision=null,loading=null,points=null,lastDetect=0,lastVideo=-1,running=false,enabled=true,comparison=false,mirrored=true,light={x:.27,y:.24},demo=true,meshIndices=[];
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5000)}
if(!gl){$('start').disabled=true;$('status').textContent='此浏览器未启用 WebGL，请使用支持 WebGL 的浏览器';throw Error('WebGL unavailable')}
const vs=`attribute vec3 pos;attribute vec3 normal;attribute float weight;varying vec2 uv;varying vec3 n;varying vec3 p;varying float w;void main(){uv=pos.xy;p=pos;n=normal;w=weight;gl_Position=vec4(pos.x*2.-1.,1.-pos.y*2.,0.,1.);}`;
const fs=`precision mediump float;
uniform sampler2D tex;
uniform vec3 light,tint,sourceLighting;
uniform float power,softness,mirror,aspect;
varying vec2 uv;varying vec3 n,p;varying float w;
void main(){
  vec2 t=vec2(mix(uv.x,1.-uv.x,mirror),uv.y);
  vec3 base=texture2D(tex,t).rgb;
  if(power<=0. || w<=0.){gl_FragColor=vec4(base,1.);return;}
  vec3 N=normalize(n);
  // A nearer virtual source gives useful lateral angles even on small faces.
  vec3 delta=vec3((light.x-p.x)*aspect,p.y-light.y,light.z*.22-p.z*.35);
  vec3 L=normalize(delta);
  float wrap=mix(.03,.60,softness);
  float diffuse=pow(clamp((dot(N,L)+wrap)/(1.+wrap),0.,1.),mix(1.35,.85,softness));
  float ambient=mix(.20,.46,softness);
  float target=ambient+(1.-ambient)*diffuse;
  float reference=ambient+(1.-ambient)*pow(max(N.z,0.),mix(1.35,.85,softness));
  // Relative illumination, never a white additive layer. Limit both stops.
  float directional=clamp(log(max(target,.12)/max(reference,.22)),-.95,.65);
  float oldShade=clamp(dot(sourceLighting,N-vec3(0.,0.,1.)),-.45,.45);
  float strength=clamp(power,0.,1.5);
  float logGain=clamp((directional-oldShade*.50)*strength,-1.15,.78);
  vec3 linear=pow(base,vec3(2.2));
  vec3 chroma=pow(max(tint,vec3(.01)),vec3(2.2));
  chroma/=max(dot(chroma,vec3(.2126,.7152,.0722)),.05);
  float colorMix=clamp(diffuse*strength*.42,0.,.65);
  vec3 factor=exp(logGain)*mix(vec3(1.),chroma,colorMix);
  vec3 lit=linear*factor;
  // Smooth highlight shoulder with a single RGB scale to retain chroma.
  float peak=max(lit.r,max(lit.g,lit.b));
  float basePeak=max(linear.r,max(linear.g,linear.b));
  float headroom=max(1.-basePeak,.001);
  float mapped=peak>basePeak?basePeak+headroom*(1.-exp(-(peak-basePeak)/headroom)):peak;
  lit*=mapped/max(peak,.00001);
  float blend=smoothstep(0.,1.,clamp(w,0.,1.));
  gl_FragColor=vec4(pow(max(mix(linear,lit,blend),vec3(0.)),vec3(1./2.2)),1.);
}`;
function shader(type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
let prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);for(const [name,size,offset] of [['pos',3,0],['normal',3,12],['weight',1,24]]){let a=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,28,offset)}
const uniforms=Object.fromEntries(['tex','light','tint','power','softness','mirror','aspect','sourceLighting'].map(n=>[n,gl.getUniformLocation(prog,n)]));
let texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
const demoCanvas=document.createElement('canvas');demoCanvas.width=960;demoCanvas.height=720;let dc=demoCanvas.getContext('2d');
function drawDemo(){let g=dc.createRadialGradient(480,300,30,480,350,600);g.addColorStop(0,'#50505c');g.addColorStop(1,'#202129');dc.fillStyle=g;dc.fillRect(0,0,960,720);dc.fillStyle='#37313d';dc.beginPath();dc.ellipse(480,770,260,280,0,0,Math.PI*2);dc.fill();let skin=dc.createRadialGradient(410,250,10,490,350,240);skin.addColorStop(0,'#c8b5af');skin.addColorStop(.7,'#8f7f7f');skin.addColorStop(1,'#514751');dc.fillStyle=skin;dc.beginPath();dc.ellipse(480,330,143,200,0,0,Math.PI*2);dc.fill();dc.fillStyle='#514650';for(let x of [423,537]){dc.beginPath();dc.ellipse(x,305,23,6,0,0,Math.PI*2);dc.fill()}dc.strokeStyle='#736168';dc.lineWidth=4;dc.beginPath();dc.moveTo(484,315);dc.lineTo(470,370);dc.lineTo(493,374);dc.stroke();dc.beginPath();dc.ellipse(480,415,32,7,0,0,Math.PI);dc.stroke()}
drawDemo();
let demoP=[],demoI=[];const rows=28,cols=48;for(let r=0;r<=rows;r++){let v=r/rows,theta=v*Math.PI;for(let c=0;c<=cols;c++){let a=c/cols*Math.PI*2;let x=Math.sin(theta)*Math.cos(a),y=Math.cos(theta);demoP.push({x:.5+x*.149,y:.458+y*.278,z:-Math.sin(theta)*Math.sin(a)*.11})}}for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let a=r*(cols+1)+c,b=a+cols+1;demoI.push(a,b,a+1,a+1,b,b+1)}
// Demo uses only front-facing hemisphere.
demoI=demoI.filter((_,i)=>{let a=Math.floor(i/3)*3;return demoI.slice(a,a+3).every(idx=>demoP[idx].z<=.001)});
const oval=new Set([10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]);
function meshData(ps,indices,isDemo){const normals=ps.map(()=>[0,0,0]);let positions=ps.map(p=>[isDemo?p.x:(mirrored?1-p.x:p.x),p.y,-p.z*canvas.width/canvas.height]);for(let i=0;i<indices.length;i+=3){let [a,b,c]=indices.slice(i,i+3);if(!positions[c])continue;let A=positions[a],B=positions[b],C=positions[c],u=[(B[0]-A[0])*canvas.width/canvas.height,A[1]-B[1],B[2]-A[2]],v=[(C[0]-A[0])*canvas.width/canvas.height,A[1]-C[1],C[2]-A[2]];let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(n[2]<0)n=n.map(x=>-x);for(let k of [a,b,c])for(let j=0;j<3;j++)normals[k][j]+=n[j]}
// Broad feathering over the outer mesh rings, rather than a hard face cutout.
const neighbors=ps.map(()=>new Set());
for(let i=0;i<indices.length;i+=3){let tri=indices.slice(i,i+3);for(let a of tri)for(let b of tri)if(a!==b)neighbors[a].add(b)}
let rings=ps.map((_,i)=>oval.has(i)?0:99);
if(!isDemo){for(let r=0;r<4;r++){let next=rings.slice();for(let i=0;i<ps.length;i++)for(let j of neighbors[i])next[i]=Math.min(next[i],rings[j]+1);rings=next;}
  if(ps!==lastLightingPoints){estimateLighting(ps,normals);lastLightingPoints=ps;}
}else sourceLighting=[0,0,0];
let data=[];for(let idx of indices){if(!positions[idx])continue;let n=normals[idx],len=Math.hypot(...n)||1,w=isDemo?Math.max(0,Math.min(1,positions[idx][2]/.035)):Math.min(1,rings[idx]/4);data.push(...positions[idx],...n.map(x=>x/len),w)}return new Float32Array(data)}
let sourceLighting=[0,0,0],lastLightingPoints=null;
const meter=document.createElement('canvas');meter.width=160;meter.height=120;
const meterCtx=meter.getContext('2d',{willReadFrequently:true});
const skinSamples=[10,67,69,104,108,109,151,337,338,297,299,333,336,9,50,101,118,119,123,147,187,205,206,207,280,330,347,348,352,376,411,425,426,427];
function estimateLighting(ps,normals){
  if(video.readyState<2)return;
  try{
    meterCtx.drawImage(video,0,0,160,120);
    const pixels=meterCtx.getImageData(0,0,160,120).data;
    const A=Array.from({length:4},()=>Array(5).fill(0));
    let count=0;
    for(let idx of skinSamples){const p=ps[idx],v=normals[idx];if(!p||!v)continue;
      const len=Math.hypot(...v)||1,N=v.map(x=>x/len);if(N[2]<.35)continue;
      const x=Math.round(p.x*159),y=Math.round(p.y*119);if(x<1||x>158||y<1||y>118)continue;
      let luma=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let o=((y+dy)*160+x+dx)*4;luma+=(.2126*pixels[o]+.7152*pixels[o+1]+.0722*pixels[o+2])/255;}
      luma/=9;if(luma<.08||luma>.92)continue;
      const row=[1,...N],value=Math.log(Math.max(luma,.03))*2.2;
      for(let a=0;a<4;a++){for(let b=0;b<4;b++)A[a][b]+=row[a]*row[b];A[a][4]+=row[a]*value;}count++;
    }
    if(count<10)return;
    for(let i=1;i<4;i++)A[i][i]+=3.;
    for(let i=0;i<4;i++){let pivot=i;for(let k=i+1;k<4;k++)if(Math.abs(A[k][i])>Math.abs(A[pivot][i]))pivot=k;
      [A[i],A[pivot]]=[A[pivot],A[i]];const d=A[i][i];if(Math.abs(d)<1e-6)return;
      for(let j=i;j<5;j++)A[i][j]/=d;
      for(let k=0;k<4;k++)if(k!==i){const f=A[k][i];for(let j=i;j<5;j++)A[k][j]-=f*A[i][j];}}
    sourceLighting=sourceLighting.map((old,i)=>old*.85+Math.max(-.7,Math.min(.7,A[i+1][4]))*.15);
  }catch{sourceLighting=[0,0,0];}
}
async function loadModel(){if(detector)return;if(loading)return loading;loading=(async()=>{ $('status').textContent='◌ 正在准备本地人脸模型…';vision=await import('./assets/vision.mjs');const files=await vision.FilesetResolver.forVisionTasks('./assets/wasm');detector=await vision.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./assets/face.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minTrackingConfidence:.5});const edges=vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION;for(let i=0;i<edges.length;i+=3){const e=edges.slice(i,i+3);let tri=[...new Set(e.flatMap(x=>[x.start,x.end]))];if(tri.length===3)meshIndices.push(...tri)}})();try{await loading}catch(e){loading=null;throw e}}
function draw(data,mode=gl.TRIANGLES){gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.drawArrays(mode,0,data.length/7)}
function render(now){requestAnimationFrame(render);if(document.hidden)return;let source=demo?demoCanvas:video;if(!demo&&video.readyState<2)return;
if(!demo&&detector&&video.currentTime!==lastVideo&&now-lastDetect>65){lastVideo=video.currentTime;lastDetect=now;try{points=detector.detectForVideo(video,now).faceLandmarks[0]||null;$('track').textContent=points?'● 人脸已追踪 · 本地计算':'○ 未检测到人脸，请正对摄像头';$('status').textContent=points?'● 方向光重塑 · v0.2':'○ 等待人脸'}catch(e){points=null;$('status').textContent='追踪暂停，请重新开启摄像头'}}
gl.viewport(0,0,canvas.width,canvas.height);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);gl.uniform1i(uniforms.tex,0);gl.uniform1f(uniforms.aspect,canvas.width/canvas.height);gl.uniform1f(uniforms.mirror,!demo&&mirrored?1:0);let col=$('color').value.match(/\w\w/g).map(x=>parseInt(x,16)/255);gl.uniform3fv(uniforms.tint,col);gl.uniform3fv(uniforms.sourceLighting,sourceLighting);gl.uniform3f(uniforms.light,light.x,light.y,+$('depth').value/100);gl.uniform1f(uniforms.softness,+$('soft').value/100);gl.uniform1f(uniforms.power,0);draw(new Float32Array([0,0,0,0,0,1,0,1,0,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,1,0,0,0,0,1,0,1,1,0,0,0,1,0]));
if(enabled&&!comparison&&(demo||points)){gl.uniform1f(uniforms.power,+$('power').value/100);let data=meshData(demo?demoP:points,demo?demoI:meshIndices,demo);gl.uniform3fv(uniforms.sourceLighting,sourceLighting);draw(data);if($('mesh').checked){gl.uniform1f(uniforms.power,2.5);draw(data,gl.LINE_LOOP)}}}
requestAnimationFrame(render);
let requestId=0;
$('start').onclick=async()=>{const id=++requestId;$('start').disabled=true;$('start').textContent='正在开启…';let candidate;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('当前环境无法访问摄像头，请在 HTTPS 页面中打开');candidate=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false});if(id!==requestId){candidate.getTracks().forEach(t=>t.stop());return}stream=candidate;video.srcObject=stream;await video.play();await loadModel();if(id!==requestId)return;canvas.width=video.videoWidth;canvas.height=video.videoHeight;$('stage').style.aspectRatio=`${canvas.width}/${canvas.height}`;demo=false;running=true;points=null;sourceLighting=[0,0,0];lastLightingPoints=null;lastVideo=-1;$('welcome').style.display='none';$('mode').textContent='实时画面';$('stop').disabled=false;stream.getVideoTracks()[0].addEventListener('ended',stopCamera)}catch(e){candidate?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;let msg=e.name==='NotAllowedError'?'摄像头权限未开启。请在浏览器地址栏允许摄像头后重试。':e.name==='NotFoundError'?'没有找到摄像头，请连接摄像头后重试。':e.name==='NotReadableError'?'摄像头可能正在被其他程序使用。':`启动失败：${e.message}`;toast(msg);$('status').textContent='○ '+msg}finally{$('start').disabled=false;$('start').textContent='开启摄像头 ↗'}};
function stopCamera(){requestId++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;demo=true;running=false;points=null;canvas.width=960;canvas.height=720;$('stage').style.aspectRatio='4/3';$('welcome').style.display='flex';$('mode').textContent='演示模式';$('track').textContent='● 演示模型 · 拖动试试';$('status').textContent='◌ 摄像头已关闭';$('stop').disabled=true}
$('stop').onclick=stopCamera;window.addEventListener('pagehide',()=>{requestId++;stream?.getTracks().forEach(t=>t.stop())});
function place(){orb.style.left=light.x*100+'%';orb.style.top=light.y*100+'%'}function move(e){let r=$('stage').getBoundingClientRect();light.x=Math.max(.03,Math.min(.97,(e.clientX-r.left)/r.width));light.y=Math.max(.04,Math.min(.92,(e.clientY-r.top)/r.height));place()}
let dragging=false;orb.onpointerdown=e=>{dragging=true;orb.setPointerCapture(e.pointerId);move(e)};orb.onpointermove=e=>{if(dragging)move(e)};orb.onpointerup=orb.onpointercancel=()=>dragging=false;orb.onkeydown=e=>{let d={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]}[e.key];if(d){e.preventDefault();light.x=Math.max(.03,Math.min(.97,light.x+d[0]));light.y=Math.max(.04,Math.min(.92,light.y+d[1]));place()}};
function update(){for(let id of ['power','soft','depth'])$(id+'Val').value=$(id).value+'%';$('hex').textContent=$('color').value.toUpperCase();orb.style.filter=`drop-shadow(0 0 12px ${$('color').value}66)`}for(let id of ['power','soft','depth','color'])$(id).oninput=()=>{update();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'))};
const presets={soft:[65,55,60,'#fff1db',.27,.24],warm:[90,80,70,'#ffb970',.28,.3],cool:[85,45,60,'#a9cbff',.76,.25],side:[110,10,35,'#fff1db',.08,.42]};function preset(name){let p=presets[name];['power','soft','depth','color'].forEach((id,i)=>$(id).value=p[i]);light={x:p[4],y:p[5]};enabled=true;$('toggle').textContent='开启';$('toggle').classList.add('active');place();update();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===name))}document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{$('color').value=b.dataset.color;update()});$('reset').onclick=()=>preset('soft');$('toggle').onclick=()=>{enabled=!enabled;$('toggle').textContent=enabled?'开启':'关闭';$('toggle').classList.toggle('active',enabled);orb.style.opacity=enabled?1:.4};$('compare').onclick=()=>{comparison=!comparison;$('compare').classList.toggle('active',comparison);$('compare').textContent=comparison?'◐ 返回补光':'◐ 原图对比'};$('mirror').onclick=()=>{mirrored=!mirrored;$('mirror').classList.toggle('active',mirrored)};$('selectLight').onclick=()=>orb.focus();$('capture').onclick=()=>{if(demo){toast('请先开启摄像头，再导出补光画面');return}canvas.toBlob(blob=>{if(!blob){toast('导出失败，请重试');return}let a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='luma-'+Date.now()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('画面已在本地导出')},'image/png')};update();
