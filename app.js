const $=id=>document.getElementById(id),canvas=$('view'),video=$('video'),orb=$('orb');
const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:false});
let stream=null,demo=true,enabled=true,comparison=false,mirrored=true,light={x:.27,y:.24},worker=null,loading=null,ready=false,busy=false,epoch=0,depthValid=false,lastInference=0,depthValues=null,depthWidth=1,depthHeight=1,lastFrameTime=-1;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',6500)}
if(!gl){$('start').disabled=true;$('status').textContent='浏览器未启用 WebGL';throw Error('WebGL unavailable')}
const vs=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;uv.y=1.-uv.y;gl_Position=vec4(position,0.,1.);}`;
const fs=`precision highp float;
uniform sampler2D frame,depthMap;
uniform float mirror,aspect,power,softness,height,relightEnabled,debugDepth;
uniform vec2 bulb,texel;
uniform vec3 color;
varying vec2 uv;
vec2 sourceUV(vec2 p){return vec2(mix(p.x,1.-p.x,mirror),p.y);}
float rawDepth(vec2 p){return texture2D(depthMap,clamp(sourceUV(p),.001,.999)).r;}
float depth(vec2 p){
 float c=rawDepth(p),sum=c,total=1.;
 for(int i=0;i<4;i++){
  vec2 offset=i==0?vec2(texel.x,0.):i==1?vec2(-texel.x,0.):i==2?vec2(0.,texel.y):vec2(0.,-texel.y);
  float d=rawDepth(p+offset),w=exp(-abs(d-c)*22.);sum+=d*w;total+=w;
 }
 return sum/total;
}
vec3 point(vec2 p){return vec3((p.x-.5)*aspect,.5-p.y,depth(p)*.40);}
void main(){
 vec3 original=texture2D(frame,sourceUV(uv)).rgb;
 if(relightEnabled<.5){gl_FragColor=vec4(original,1.);return;}
 float d=depth(uv);
 if(debugDepth>.5){gl_FragColor=vec4(vec3(d),1.);return;}
 if(power<=0.){gl_FragColor=vec4(original,1.);return;}
 vec3 P=vec3((uv.x-.5)*aspect,.5-uv.y,d*.40);
 vec2 stepUV=max(texel*1.5,vec2(.003));
 float dzdx=(depth(uv+vec2(stepUV.x,0.))-depth(uv-vec2(stepUV.x,0.)))*.40;
 float dzdy=(depth(uv+vec2(0.,stepUV.y))-depth(uv-vec2(0.,stepUV.y)))*.40;
 vec3 N=normalize(vec3(-dzdx/(2.*stepUV.x*aspect),dzdy/(2.*stepUV.y),1.));
 // Height is a signed offset from the scene surface at the light's screen position.
 vec3 lamp=point(bulb);lamp.z+=(height-.70)*.80;
 vec3 delta=lamp-P;float distance2=dot(delta,delta);
 vec3 L=normalize(delta+vec3(0.,0.,.0001));
 float wrap=mix(.01,.48,softness);
 float diffuse=max(0.,(dot(N,L)+wrap)/(1.+wrap));
 float visibility=1.;
 // Test the 2.5D depth field along the path towards the bulb.
 for(int i=1;i<=16;i++){
  float t=float(i)/17.;vec2 rayUV=mix(uv,bulb,t);
  float rayZ=mix(P.z,lamp.z,t);float blocker=depth(rayUV)*.40;
  float bias=.012+softness*.025+t*.008;
  float blocked=smoothstep(bias,bias+.025+softness*.025,blocker-rayZ);
  visibility=min(visibility,1.-blocked*.85);
 }
 float attenuation=1./(1.+distance2*5.);
 float fill=mix(.30,.52,softness);
 float key=diffuse*visibility*attenuation*power*2.5;
 vec3 tint=pow(max(color,vec3(.01)),vec3(2.2));
 tint/=max(dot(tint,vec3(.2126,.7152,.0722)),.05);
 vec3 linear=pow(original,vec3(2.2));
 vec3 factor=vec3(fill)+key*mix(vec3(1.),tint,.75);
 vec3 lit=linear*factor;
 float peak=max(lit.r,max(lit.g,lit.b));
 if(peak>.85)lit*=(.85+.15*(1.-exp(-(peak-.85)/.15)))/peak;
 // Fade strength continuously to original at zero; no hard face-shaped mask.
 vec3 result=mix(linear,lit,smoothstep(0.,.25,power));
 gl_FragColor=vec4(pow(max(result,vec3(0.)),vec3(1./2.2)),1.);
}`;
function compile(type,source){let shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader}
const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);let attr=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
const u=Object.fromEntries(['frame','depthMap','mirror','aspect','power','softness','height','relightEnabled','debugDepth','bulb','texel','color'].map(k=>[k,gl.getUniformLocation(program,k)]));
function makeTexture(unit){gl.activeTexture(gl.TEXTURE0+unit);let t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
const imageTexture=makeTexture(0),depthTexture=makeTexture(1);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,1,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,new Uint8Array([128]));gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
const demoCanvas=document.createElement('canvas');demoCanvas.width=960;demoCanvas.height=720;const dc=demoCanvas.getContext('2d');let gradient=dc.createLinearGradient(0,0,960,720);gradient.addColorStop(0,'#35313f');gradient.addColorStop(1,'#171c24');dc.fillStyle=gradient;dc.fillRect(0,0,960,720);dc.strokeStyle='#9e86bb22';for(let x=-600;x<1600;x+=70){dc.beginPath();dc.moveTo(x,0);dc.lineTo(x+500,720);dc.stroke()}
let runtimeDtype='';
function runtime(){if(ready)return Promise.resolve();if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  worker=new Worker(new URL('./depth-worker.bundle.js?v=0.3.1',import.meta.url),{type:'module'});
  let initTimer=setTimeout(()=>{worker?.terminate();worker=null;loading=null;reject(Error('模型加载超时，请检查网络后重试'))},180000);
  worker.onerror=e=>{clearTimeout(initTimer);loading=null;busy=false;reject(Error(e.message||'深度引擎无法启动'));if(!demo)toast('深度引擎异常，请关闭摄像头后重试')};
  worker.onmessage=({data:m})=>{
   if(m.type==='notice'){$('status').textContent='◌ '+m.message;return;}
   if(m.type==='progress'){$('status').textContent=`◌ 正在加载本地深度模型 ${m.value}%`;return;}
   if(m.type==='ready'){clearTimeout(initTimer);runtimeDtype=m.dtype.toUpperCase();ready=true;resolve();return;}
   if(m.type==='error'){busy=false;if(!ready){clearTimeout(initTimer);loading=null;worker.terminate();worker=null;reject(Error(m.message))}else{$('status').textContent='深度估计失败';toast(m.message);stopCamera()}return;}
   if(m.type==='depth'){
    busy=false;if(m.epoch!==epoch||demo)return;
    const incoming=m.pixels;if(depthValues?.length!==incoming.length)depthValues=new Float32Array(incoming);
    const packed=new Uint8Array(incoming.length);
    for(let i=0;i<incoming.length;i++){let change=Math.abs(incoming[i]-depthValues[i]);let alpha=change>.12?.82:.45;depthValues[i]+=alpha*(incoming[i]-depthValues[i]);packed[i]=Math.round(depthValues[i]*255);}
    depthWidth=m.width;depthHeight=m.height;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,depthTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,m.width,m.height,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,packed);depthValid=true;
    $('track').textContent='● 全画面深度 · WebGPU / '+runtimeDtype;$('status').textContent=`● 场景重光照 v0.3.1 · ${runtimeDtype} · 深度 ${Math.round(m.ms)} ms`;
   }
  };worker.postMessage({type:'init'});
 });return loading;
}
async function infer(now){if(demo||!ready||busy||video.readyState<2||now-lastInference<80||lastFrameTime===video.currentTime)return;
 busy=true;lastInference=now;lastFrameTime=video.currentTime;const token=epoch;
 try{const bitmap=await createImageBitmap(video,{resizeWidth:392,resizeHeight:Math.round(392*video.videoHeight/video.videoWidth)});if(token!==epoch||demo){bitmap.close();busy=false;return}worker.postMessage({type:'frame',bitmap,width:bitmap.width,height:bitmap.height,epoch:token},[bitmap]);}
 catch(e){busy=false;toast('读取摄像头帧失败：'+e.message);stopCamera()}}
function render(now){requestAnimationFrame(render);if(document.hidden)return;const source=demo?demoCanvas:video;if(!demo&&video.readyState<2)return;infer(now);
 gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,imageTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,depthTexture);
 gl.uniform1i(u.frame,0);gl.uniform1i(u.depthMap,1);gl.uniform1f(u.mirror,!demo&&mirrored?1:0);gl.uniform1f(u.aspect,canvas.width/canvas.height);gl.uniform1f(u.power,+$('power').value/100);gl.uniform1f(u.softness,+$('soft').value/100);gl.uniform1f(u.height,+$('depth').value/100);gl.uniform1f(u.relightEnabled,!demo&&depthValid&&enabled&&!comparison?1:0);gl.uniform1f(u.debugDepth,$('mesh').checked?1:0);gl.uniform2f(u.bulb,light.x,light.y);gl.uniform2f(u.texel,1/depthWidth,1/depthHeight);gl.uniform3fv(u.color,$('color').value.match(/\w\w/g).map(x=>parseInt(x,16)/255));gl.drawArrays(gl.TRIANGLES,0,6);
}requestAnimationFrame(render);
let requestId=0;
$('start').onclick=async()=>{const request=++requestId;$('start').disabled=true;$('start').textContent='正在准备深度引擎…';let candidate;
 try{if(!navigator.gpu)throw Error('当前浏览器没有 WebGPU。请使用启用硬件加速的 Chrome 或 Edge。');if(!navigator.mediaDevices?.getUserMedia)throw Error('当前页面无法访问摄像头，请使用 HTTPS');await runtime();if(request!==requestId)return;
 candidate=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false});if(request!==requestId){candidate.getTracks().forEach(t=>t.stop());return}
 stream=candidate;video.srcObject=stream;await video.play();canvas.width=video.videoWidth;canvas.height=video.videoHeight;$('stage').style.aspectRatio=`${canvas.width}/${canvas.height}`;
 epoch++;depthValid=false;depthValues=null;lastFrameTime=-1;demo=false;$('welcome').style.display='none';$('mode').textContent='全画面重光照';$('stop').disabled=false;$('track').textContent='○ 正在估计场景深度';$('status').textContent='◌ 摄像头已开启，等待第一帧深度';stream.getVideoTracks()[0].addEventListener('ended',stopCamera);
 }catch(e){candidate?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;const message=e.name==='NotAllowedError'?'请允许摄像头权限后重试。':e.message;toast(message);$('status').textContent='○ '+message;}
 finally{$('start').disabled=false;$('start').textContent='开启摄像头 ↗'}
};
function stopCamera(){requestId++;epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;demo=true;depthValid=false;depthValues=null;canvas.width=960;canvas.height=720;$('stage').style.aspectRatio='4/3';$('welcome').style.display='flex';$('mode').textContent='全画面深度引擎';$('track').textContent='○ 摄像头未开启';$('status').textContent='◌ 摄像头已关闭';$('stop').disabled=true}
$('stop').onclick=stopCamera;window.addEventListener('pagehide',()=>{epoch++;stream?.getTracks().forEach(t=>t.stop());worker?.terminate()});
function place(){orb.style.left=light.x*100+'%';orb.style.top=light.y*100+'%'}function move(e){let r=$('stage').getBoundingClientRect();light.x=Math.max(.03,Math.min(.97,(e.clientX-r.left)/r.width));light.y=Math.max(.04,Math.min(.92,(e.clientY-r.top)/r.height));place()}
let dragging=false;orb.onpointerdown=e=>{dragging=true;orb.setPointerCapture(e.pointerId);move(e)};orb.onpointermove=e=>{if(dragging)move(e)};orb.onpointerup=orb.onpointercancel=()=>dragging=false;orb.onkeydown=e=>{let d={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]}[e.key];if(d){e.preventDefault();light.x=Math.max(.03,Math.min(.97,light.x+d[0]));light.y=Math.max(.04,Math.min(.92,light.y+d[1]));place()}};
function update(){for(let id of ['power','soft','depth'])$(id+'Val').value=$(id).value+'%';$('hex').textContent=$('color').value.toUpperCase();orb.style.filter=`drop-shadow(0 0 12px ${$('color').value}66)`}for(let id of ['power','soft','depth','color'])$(id).oninput=()=>{update();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'))};
const presets={soft:[65,55,120,'#fff1db',.27,.24],warm:[90,80,125,'#ffb970',.28,.3],cool:[85,45,120,'#a9cbff',.76,.25],side:[100,10,105,'#fff1db',.08,.42]};function preset(name){let p=presets[name];['power','soft','depth','color'].forEach((id,i)=>$(id).value=p[i]);light={x:p[4],y:p[5]};enabled=true;$('toggle').textContent='开启';$('toggle').classList.add('active');place();update();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===name))}document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{$('color').value=b.dataset.color;update()});$('reset').onclick=()=>preset('soft');$('toggle').onclick=()=>{enabled=!enabled;$('toggle').textContent=enabled?'开启':'关闭';$('toggle').classList.toggle('active',enabled);orb.style.opacity=enabled?1:.4};$('compare').onclick=()=>{comparison=!comparison;$('compare').classList.toggle('active',comparison);$('compare').textContent=comparison?'◐ 返回补光':'◐ 原图对比'};$('mirror').onclick=()=>{mirrored=!mirrored;$('mirror').classList.toggle('active',mirrored)};$('selectLight').onclick=()=>orb.focus();$('capture').onclick=()=>{if(demo){toast('请先开启摄像头，再导出补光画面');return}canvas.toBlob(blob=>{if(!blob){toast('导出失败，请重试');return}let a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='luma-'+Date.now()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('画面已在本地导出')},'image/png')};update();
