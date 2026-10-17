export function tsNormalizeThingLogo(event){
  var image=event.currentTarget,chip=image.closest("[data-ts-logo-chip]");
  if(!chip||!image.naturalWidth||!image.naturalHeight)return;
  var canvas=document.createElement("canvas"),scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  var context=canvas.getContext("2d",{willReadFrequently:true});if(!context)return;
  context.drawImage(image,0,0,canvas.width,canvas.height);
  var data;try{data=context.getImageData(0,0,canvas.width,canvas.height).data}catch(error){return}
  var colors=new Map();
  function edge(x,y){var i=(y*canvas.width+x)*4,key=[data[i],data[i+1],data[i+2],data[i+3]].join(",");colors.set(key,(colors.get(key)||0)+1)}
  for(var x=0;x<canvas.width;x++){edge(x,0);edge(x,canvas.height-1)}
  for(var y=0;y<canvas.height;y++){edge(0,y);edge(canvas.width-1,y)}
  var background=[].slice.call(colors).sort(function(a,b){return b[1]-a[1]})[0][0].split(",").map(Number);
  var left=canvas.width,right=-1,top=canvas.height,bottom=-1;
  for(var y=0;y<canvas.height;y++)for(var x=0;x<canvas.width;x++){
    var i=(y*canvas.width+x)*4;
    if(data[i+3]<16)continue;
    if(background[3]>=16&&Math.max(Math.abs(data[i]-background[0]),Math.abs(data[i+1]-background[1]),Math.abs(data[i+2]-background[2]))<=24)continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left||bottom<top)return;
  var box=chip.getBoundingClientRect(),border=parseFloat(getComputedStyle(chip).borderTopWidth)||0;
  var fit=Math.min((box.width-2*border)/(right-left+1),(box.height-2*border)/(bottom-top+1));
  image.style.maxWidth="none";image.style.maxHeight="none";
  image.style.width=canvas.width*fit+"px";image.style.height=canvas.height*fit+"px";
  image.style.transform="translate("+(canvas.width-left-right-1)*fit/2+"px,"+(canvas.height-top-bottom-1)*fit/2+"px)";
}

export function tsPaintTabEmoji(node,emoji){
  if(!node||!emoji)return;
  function render(){
    if(!node.isConnected)return;
    var chip=node.closest("[data-ts-category-tab-icon]")||node.parentElement;
    var button=chip.closest("button"),box=node.getBoundingClientRect();
    if(!box.width||!box.height)return;
    var dpr=window.devicePixelRatio||1;
    node.width=Math.round(box.width*dpr);node.height=Math.round(box.height*dpr);
    var ctx=node.getContext("2d",{willReadFrequently:true}),cs=getComputedStyle(chip);
    if(!ctx)return;
    var background=getComputedStyle(button||chip).backgroundColor.match(/[\d.]+/g);
    var bg=background?background.slice(0,3).map(Number):[255,255,255];
    var target=button?button.getBoundingClientRect():box;
    var center=(Math.round(target.top)+Math.round(target.height)/2)*dpr-Math.round(box.top*dpr);
    var glyph=document.createElement("canvas");
    glyph.width=node.width*2;glyph.height=node.height*2;
    var ink=glyph.getContext("2d",{willReadFrequently:true});if(!ink)return;
    ink.font=cs.fontWeight+" "+parseFloat(cs.fontSize)*dpr+"px "+cs.fontFamily;
    ink.textAlign="center";ink.textBaseline="middle";ink.fillStyle=cs.color;
    ink.fillText(emoji,glyph.width/2,glyph.height/2);
    var data=ink.getImageData(0,0,glyph.width,glyph.height).data,sum=0,mass=0;
    for(var y=0;y<glyph.height;y++)for(var x=0;x<glyph.width;x++){
      var i=(y*glyph.width+x)*4,alpha=data[i+3]/255;
      var weight=(Math.abs(data[i]-bg[0])+Math.abs(data[i+1]-bg[1])+Math.abs(data[i+2]-bg[2]))*alpha;
      if(weight<18)continue;
      sum+=y*weight;mass+=weight;
    }
    if(!mass)return;
    ctx.clearRect(0,0,node.width,node.height);
    ctx.drawImage(glyph,(node.width-glyph.width)/2,center-sum/mass);
  }
  requestAnimationFrame(render);
  document.fonts.ready.then(render).catch(function(error){console.error("tab fonts unavailable",error)});
  if(!node.tsEmojiResize){node.tsEmojiResize=new ResizeObserver(render);node.tsEmojiResize.observe(node)}
}
