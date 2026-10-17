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
    var chip=node.closest("[data-ts-logo-chip],[data-ts-category-tab-icon]")||node.parentElement;
    var tab=node.closest("[data-tab-category]"),button=tab&&tab.closest("button"),box=node.getBoundingClientRect();
    if(!box.width||!box.height)return;
    var dpr=window.devicePixelRatio||1;
    node.width=Math.round(box.width*dpr);node.height=Math.round(box.height*dpr);
    var ctx=node.getContext("2d",{willReadFrequently:true}),cs=getComputedStyle(chip);
    if(!ctx)return;
    var bg=[255,255,255];
    for(var layer=button||chip;layer;layer=layer.parentElement){
      var paint=getComputedStyle(layer).backgroundColor.match(/[\d.]+/g);
      if(paint&&(paint.length<4||+paint[3]>0)){bg=paint.slice(0,3).map(Number);break}
    }
    var target=(button||chip).getBoundingClientRect();
    var origin=Math.round(box.top*dpr);
    var snapped=(Math.round(target.top*dpr)+Math.round((target.top+target.height)*dpr))/2;
    var center=(snapped+(target.top+target.height/2)*dpr)/2-origin;
    var glyph=document.createElement("canvas");
    glyph.width=node.width*3;glyph.height=node.height*3;
    var ink=glyph.getContext("2d",{willReadFrequently:true});if(!ink)return;
    ink.font=cs.fontWeight+" "+parseFloat(cs.fontSize)*dpr+"px "+cs.fontFamily;
    ink.textAlign="center";ink.textBaseline="middle";ink.fillStyle=cs.color;
    ink.fillText(emoji,glyph.width/2,glyph.height/2);
    function measure(context,width,height){
      var data=context.getImageData(0,0,width,height).data,sum=0,mass=0;
      var left=width,right=-1,top=height,bottom=-1;
      for(var y=0;y<height;y++)for(var x=0;x<width;x++){
        var i=(y*width+x)*4,alpha=data[i+3]/255;
        if(alpha<16/255)continue;
        var diff=[0,1,2].map(function(k){return Math.abs(Math.round(data[i+k]*alpha+bg[k]*(1-alpha))-bg[k])});
        var weight=diff[0]+diff[1]+diff[2];
        if(button?weight<18:Math.max.apply(null,diff)<=24)continue;
        sum+=y*weight;mass+=weight;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      return mass?{center:button?sum/mass:(top+bottom+1)/2,left:left,right:right,top:top,bottom:bottom}:null;
    }
    var source=measure(ink,glyph.width,glyph.height);if(!source)return;
    var scale=Math.min(1,node.width/(source.right-source.left+1),center/(source.center-source.top),
      (node.height-center)/(source.bottom+1-source.center));
    var dx=(node.width-(source.right-source.left+1)*scale)/2-source.left*scale;
    var dy=center-source.center*scale;
    function draw(y){ctx.clearRect(0,0,node.width,node.height);ctx.drawImage(glyph,dx,y,glyph.width*scale,glyph.height*scale)}
    var best=null;
    for(var pass=0;pass<6;pass++){
      draw(dy);
      var painted=measure(ctx,node.width,node.height);if(!painted)return;
      var error=center-painted.center;
      if(!best||Math.abs(error)<Math.abs(best.error))best={error:error,dy:dy};
      if(Math.abs(error)<=0.05*dpr)break;
      dy+=error;
    }
    if(best.dy!==dy)draw(best.dy);
  }
  requestAnimationFrame(render);
  document.fonts.ready.then(render).catch(function(error){console.error("logo fonts unavailable",error)});
  if(!node.tsEmojiResize){
    node.tsEmojiResize=new ResizeObserver(render);node.tsEmojiResize.observe(node);
    var tab=node.closest("[data-tab-category]"),button=tab&&tab.closest("button");
    if(button){node.tsEmojiResize.observe(button);button.addEventListener("transitionend",render)}
  }
}
