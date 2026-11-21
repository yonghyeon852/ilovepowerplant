// Continuous terrain sampled from the same tile centres used for construction.
// Only the static relief is rasterised; buildings scale with the camera.
const reliefCache = new WeakMap();
const reliefResolution = 12;

// Monthly tonnes, shared by every country. Before the first report use the original palette.
const MAP_NEUTRAL_CO2 = 75000;
function carbonTint(tonnes) {
  if (!Number.isFinite(tonnes) || tonnes < 0) return 0;
  return (tonnes - MAP_NEUTRAL_CO2) / (tonnes + MAP_NEUTRAL_CO2);
}

function atlasNoise(c, r) {
  const n = Math.imul(c ^ 9127, 374761393) + Math.imul(r ^ 1563, 668265263);
  const z = Math.imul(n ^ n >>> 13, 1274126177);
  return ((z ^ z >>> 16) >>> 0) / 4294967296;
}

// Continuous meadow artwork in world coordinates, including the non-playable margins.
let meadowTile;
function drawMeadow(ctx,x,y,w,h) {
  ctx.save();
  if (worldArt.meadow) {
    if (!meadowTile) {
      const img=worldArt.meadow;
      meadowTile=document.createElement('canvas');
      meadowTile.width=img.width*2;meadowTile.height=img.height*2;
      const p=meadowTile.getContext('2d');
      // Mirror adjacent panels so strands meet cleanly along every texture seam.
      for(let r=0;r<2;r++) for(let c=0;c<2;c++) {
        p.save();p.translate(c?meadowTile.width:0,r?meadowTile.height:0);
        p.scale(c?-1:1,r?-1:1);p.drawImage(img,0,0);p.restore();
      }
    }
    const pattern=ctx.createPattern(meadowTile,'repeat');
    const scale=30*TILE/worldArt.meadow.width;
    pattern.setTransform(new DOMMatrix().scale(scale));
    ctx.fillStyle=pattern;
  } else ctx.fillStyle='#84b782';
  ctx.fillRect(x,y,w,h);ctx.restore();
}

function meadowLight(x,y) {
  return 2.7*Math.sin(x*.19+Math.sin(y*.18))+2.2*Math.cos(y*.24-x*.11);
}

// Rivers originate beyond the national boundary. Continue their visible upstream
// ends over foreign land without changing a single simulation or placement tile.
function continueRiverHeads(grid,ids) {
  const rows=grid.length, cols=grid[0].length;
  let seaX=0,seaY=0,count=0;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if(grid[r][c]===SEA) {
    seaX+=c+.5;seaY+=r+.5;count++;
  }
  if(!count) return;
  const xBias=seaX/count/cols-.5,yBias=seaY/count/rows-.5;
  const vertical=Math.abs(yBias)>Math.abs(xBias);
  const step=(vertical?yBias:xBias)>0?-1:1;
  const dx=vertical?0:step,dy=vertical?step:0;
  const heads=[];
  for(let r=1;r<rows-1;r++) for(let c=1;c<cols-1;c++) {
    if(grid[r][c]===RIVER && grid[r+dy][c+dx]===FOREIGN &&
       !heads.some(h=>Math.abs(h.c-c)+Math.abs(h.r-r)<5)) heads.push({c,r});
  }
  for(const head of heads) {
    let previous=0;
    for(let d=1;d<Math.max(cols,rows);d++) {
      const shift=Math.round(1.7*Math.sin(d*.28)+.8*Math.sin(d*.42));
      const c=head.c+dx*d+(vertical?shift:0),r=head.r+dy*d+(vertical?0:shift);
      if(grid[r]?.[c]!==FOREIGN) break;
      ids[r][c]=2;
      const pc=c+(vertical?previous-shift:0),pr=r+(vertical?0:previous-shift);
      if(grid[pr]?.[pc]===FOREIGN) ids[pr][pc]=2;
      previous=shift;
    }
  }
}

function makeRelief(grid) {
  const n=reliefResolution, rows=grid.length, cols=grid[0].length;
  const layer=document.createElement('canvas'), mask=document.createElement('canvas');
  layer.width=mask.width=cols*n; layer.height=mask.height=rows*n;
  const pen=layer.getContext('2d'), maskPen=mask.getContext('2d');
  const pixels=pen.createImageData(layer.width,layer.height), haze=maskPen.createImageData(layer.width,layer.height);
  const types=[LAND,MOUNTAIN,RIVER,SEA,FOREIGN,OFFSHORE];
  const ids=grid.map(row=>Uint8Array.from(row,t=>types.indexOf(t)));
  const colors=types.map(t=>[1,3,5].map(i=>parseInt(TERRAIN_COLORS[t].slice(i,i+2),16)));
  continueRiverHeads(grid,ids);
  const weights=new Float32Array(types.length);
  const sway=Array.from({length:layer.height},(_,i)=>.10*Math.sin(i/n*1.16)+.06*Math.sin(i/n*2.31));
  const drift=Array.from({length:layer.width},(_,i)=>.11*Math.cos(i/n*1.31)+.05*Math.sin(i/n*2.04));
  for(let y=0,pos=0;y<layer.height;y++) {
    const py=(y+.5)/n-.5;
    for(let x=0;x<layer.width;x++,pos+=4) {
      const px=(x+.5)/n-.5, gx=clamp(px+sway[y],0,cols-1), gy=clamp(py+drift[x],0,rows-1);
      const c=Math.floor(gx),r=Math.floor(gy),u=gx-c,v=gy-r;
      const next=Math.min(c+1,cols-1),lower=ids[Math.min(r+1,rows-1)];
      weights.fill(0);
      weights[ids[r][c]]+=(1-u)*(1-v);weights[ids[r][next]]+=u*(1-v);
      weights[lower[c]]+=(1-u)*v;weights[lower[next]]+=u*v;
      const water=weights[2]+weights[3]+weights[5];
      let alpha=1;
      if(water>.5) {
        const river=weights[2]/water, coast=clamp((.96-water)*2.3,0,1);
        const ripple=2*Math.sin(py*.6+Math.sin(px*.3))+.7*Math.cos(px*.52+py*.44);
        for(let k=0;k<3;k++) {
          const base=colors[3][k]+river*(colors[2][k]-colors[3][k]);
          pixels.data[pos+k]=base+coast*(217-base)*.64+ripple;
        }
      } else {
        const light=meadowLight(px,py);
        for(let k=0;k<3;k++) pixels.data[pos+k]=colors[0][k]+light;
        const slope=clamp((weights[1]-.12)/.78,0,1);
        if(slope>0) {
          const ridge=Math.sin(px*.36+py*.32+1.7*Math.sin(py*.17)+.8*Math.cos(px*.23));
          const height=1-Math.abs(ridge);
          const light=16*height-19*ridge+(height>.83?6:0);
          for(let k=0;k<3;k++) pixels.data[pos+k]+=(colors[1][k]+light-pixels.data[pos+k])*slope;
        }
        const shore=clamp((water-.18)*2.4,0,.68);
        alpha=.56+.32*Math.max(slope,shore);
        if(shore) for(let k=0;k<3;k++) pixels.data[pos+k]+=([212,210,174][k]-pixels.data[pos+k])*shore;
        haze.data[pos]=229;haze.data[pos+1]=183;haze.data[pos+2]=86;
        haze.data[pos+3]=255*clamp((weights[0]+weights[1]-.4)/.6,0,1);
      }
      pixels.data[pos+3]=255*alpha;
    }
  }
  pen.putImageData(pixels,0,0);maskPen.putImageData(haze,0,0);
  return {layer,warmLand:mask,border:countryBorder(grid),ids};
}

// Trace the playable footprint once. Rounded joins and screen-space dashes make a
// political boundary legible without painting a continuous halo around the country.
function countryBorder(grid) {
  const rows=grid.length, cols=grid[0].length, stride=cols+1;
  const edges=new Map(), path=new Path2D();
  function add(a,b) {
    if(!edges.has(a)) edges.set(a,[]);
    edges.get(a).push(b);
  }
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
    if(outsideCountry(grid[r][c])) continue;
    const a=r*stride+c, b=a+1, d=a+stride, e=d+1;
    if(!r || outsideCountry(grid[r-1][c])) add(a,b);
    if(c===cols-1 || outsideCountry(grid[r][c+1])) add(b,e);
    if(r===rows-1 || outsideCountry(grid[r+1][c])) add(e,d);
    if(!c || outsideCountry(grid[r][c-1])) add(d,a);
  }
  while(edges.size) {
    const first=edges.keys().next().value, points=[];
    let vertex=first;
    do {
      points.push([vertex%stride*TILE,Math.floor(vertex/stride)*TILE]);
      const outgoing=edges.get(vertex), next=outgoing.pop();
      if(!outgoing.length) edges.delete(vertex);
      vertex=next;
    } while(vertex!==first);
    const last=points[points.length-1], head=points[0];
    path.moveTo((last[0]+head[0])/2,(last[1]+head[1])/2);
    for(let i=0;i<points.length;i++) {
      const p=points[i], q=points[(i+1)%points.length];
      path.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);
    }
    path.closePath();
  }
  return path;
}

function drawTerrain(ctx,grid,tint=0,extendEdges=false,placing=false) {
  if(!reliefCache.has(grid)) reliefCache.set(grid,makeRelief(grid));
  const relief=reliefCache.get(grid), w=grid[0].length*TILE, h=grid.length*TILE;
  if(extendEdges) {
    const m=ctx.getTransform();
    drawMeadow(ctx,-m.e/m.a,-m.f/m.d,ctx.canvas.width/m.a,ctx.canvas.height/m.d);
    drawSurround(ctx,grid,relief);
  } else drawMeadow(ctx,0,0,w,h);
  ctx.drawImage(relief.layer,0,0,w,h);
  ctx.save();
  const haze=tint<=0 ? .11*(1+tint) : .11+.24*tint;
  if(haze>0) {
    ctx.save();ctx.globalAlpha*=haze;ctx.drawImage(relief.warmLand,0,0,w,h);ctx.restore();
  }
  const scale=ctx.getTransform().a;
  ctx.setLineDash(placing?[5/scale,3/scale]:[2.5/scale,5/scale]);
  ctx.strokeStyle=placing?'rgba(61,49,62,.86)':'rgba(63,72,72,.48)';
  ctx.lineWidth=(placing?1.55:.85)/scale;ctx.stroke(relief.border);
  ctx.restore();
}

// At whole-country zoom the canvas can extend past the last tile. Continue the edge's
// land or sea into that margin, with a curved coast, without adding playable cells.
function drawSurround(ctx,grid,relief) {
  const rows=grid.length, cols=grid[0].length, m=ctx.getTransform(), step=m.a*TILE;
  const px=Math.ceil(Math.max(0,m.e,ctx.canvas.width-m.e-cols*step)/step);
  const py=Math.ceil(Math.max(0,m.f,ctx.canvas.height-m.f-rows*step)/step);
  if (!px && !py) return;
  let bg=relief.surround;
  if (!bg || bg.px<px || bg.py<py) {
    const padX=Math.ceil(px/8)*8, padY=Math.ceil(py/8)*8;
    const image=document.createElement('canvas'), res=3;
    image.width=(cols+2*padX)*res;image.height=(rows+2*padY)*res;
    const pen=image.getContext('2d'), data=pen.createImageData(image.width,image.height);
    const rgb=key=>[1,3,5].map(i=>parseInt(TERRAIN_COLORS[key].slice(i,i+2),16));
    const sea=rgb(SEA), river=rgb(RIVER), land=rgb(LAND);
    for(let j=0,i=0;j<image.height;j++) for(let k=0;k<image.width;k++,i+=4) {
      const x=(k+.5)/res-padX, y=(j+.5)/res-padY;
      if(x>=0 && x<cols && y>=0 && y<rows) continue;
      const ex=clamp(x,0,cols-1), ey=clamp(y,0,rows-1);
      const col=clamp(Math.floor(ex+2.5*Math.sin((y-ey)*.16)),0,cols-1);
      const row=clamp(Math.floor(ey+2.5*Math.sin((x-ex)*.16)),0,rows-1);
      const id=relief.ids[row][col], wet=id===2 || id===3 || id===5;
      if(wet) {
        const ripple=2*Math.sin((y-.5)*.6+Math.sin((x-.5)*.3))+.7*Math.cos((x-.5)*.52+(y-.5)*.44);
        for(let ch=0;ch<3;ch++) data.data[i+ch]=(id===2?river:sea)[ch]+ripple;
      } else {
        const light=meadowLight(x-.5,y-.5);
        for(let ch=0;ch<3;ch++) data.data[i+ch]=land[ch]+light;
      }
      data.data[i+3]=wet?255:143;
    }
    pen.putImageData(data,0,0);bg=relief.surround={image,px:padX,py:padY};
  }
  ctx.drawImage(bg.image,-bg.px*TILE,-bg.py*TILE,(cols+2*bg.px)*TILE,(rows+2*bg.py)*TILE);
}

function strokeLine(ctx,color,width,points) {
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++) ctx.lineTo(...points[i]);
  ctx.stroke();
}
function oval(ctx,color,x,y,rx,ry) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fill();
}

function drawPlacementGrid(ctx,grid,view) {
  const left=Math.max(0,Math.floor(view.col)), top=Math.max(0,Math.floor(view.row));
  const right=Math.min(COLS,Math.ceil(view.col+visCols())), bottom=Math.min(ROWS,Math.ceil(view.row+visRows()));
  ctx.beginPath();
  for(let r=top;r<bottom;r++) for(let c=left;c<right;c++) {
    if(outsideCountry(grid[r][c])) continue;
    const x=c*TILE,y=r*TILE;
    ctx.moveTo(x+TILE,y);ctx.lineTo(x,y);ctx.lineTo(x,y+TILE);
  }
  ctx.strokeStyle='rgba(224,241,221,.32)'; ctx.lineWidth=.8/zoomOf(); ctx.stroke();
}

function drawCityReach(ctx, cities, building) {
  if (!building || !cities.length) return;
  const p = PLANTS[building.type];
  if (p.isStorage || p.isLink) return;
  const {col,row}=building;
  const cx=col+p.width/2, cy=row+p.height/2;
  let nearest, best=Infinity, tie=Infinity;
  for (const city of cities) for(const t of city.tiles) {
    const dx=Math.max(col-t.col, t.col-col-p.width+1,0);
    const dy=Math.max(row-t.row, t.row-row-p.height+1,0);
    const distance=Math.max(dx,dy), centreDistance=(t.col+.5-cx)**2+(t.row+.5-cy)**2;
    if(distance<best || distance===best && centreDistance<tie) {
      best=distance; tie=centreDistance; nearest=t;
    }
  }
  if(!nearest || !best) return;
  const end=[(nearest.col+.5)*TILE,(nearest.row+.5)*TILE];
  ctx.save();ctx.setLineDash([4/zoomOf(),3/zoomOf()]);
  strokeLine(ctx,'#fff0bd',1.4/zoomOf(),[[cx*TILE,cy*TILE],end]);ctx.restore();
  oval(ctx,'#ffe8a6',...end,2.7/zoomOf(),2.7/zoomOf());
}

// Feather the district ground into the grass, including around irregular outskirts.
const townGround = document.createElement('canvas');
townGround.width = townGround.height = 64;
{
  const paint = townGround.getContext('2d');
  const fade = paint.createRadialGradient(32,32,4,32,32,32);
  fade.addColorStop(0,'rgba(176,157,119,.53)');
  fade.addColorStop(1,'rgba(176,157,119,0)');
  paint.fillStyle=fade; paint.fillRect(0,0,64,64);
}
function drawCities(ctx,cities,showBoundary=false,tint=0) {
  for(const city of cities) {
    const hub=(c,r)=>[(c+.38+atlasNoise(c,r)*.24)*TILE,(r+.4+atlasNoise(r,c)*.2)*TILE];
    const streets=[];
    ctx.save();ctx.globalAlpha*=1+Math.min(0,tint);
    for(const {col:c,row:r} of city.tiles) {
      const [x,y]=hub(c,r);
      ctx.drawImage(townGround,x-TILE,y-TILE*.8,TILE*2,TILE*1.7);
    }
    ctx.restore();
    for(const {col:c,row:r} of city.tiles) {
      const at=hub(c,r);
      for(const [dc,dr] of [[1,0],[0,1]]) {
        if((dc || atlasNoise(c,r)>.35) && city.keys.has(tileKey(c+dc,r+dr))) streets.push([at,hub(c+dc,r+dr)]);
      }
    }
    for(const road of streets) strokeLine(ctx,'#495a58',4.5,road);
    for(const road of streets) strokeLine(ctx,'#b9b296',1.8,road);
    if(showBoundary) {
      ctx.save();ctx.strokeStyle='rgba(255,236,187,.8)';ctx.lineWidth=1.2/zoomOf();
      ctx.setLineDash([3/zoomOf(),3/zoomOf()]);ctx.beginPath();
      for(const {col:c,row:r} of city.tiles) {
        const x=c*TILE,y=r*TILE;
        for(const [dx,dy,x1,y1,x2,y2] of [[0,-1,0,0,1,0],[1,0,1,0,1,1],[0,1,0,1,1,1],[-1,0,0,0,0,1]]) {
          if(city.keys.has(tileKey(c+dx,r+dy))) continue;
          ctx.moveTo(x+x1*TILE,y+y1*TILE);ctx.lineTo(x+x2*TILE,y+y2*TILE);
        }
      }
      ctx.stroke();ctx.restore();
    }
    // Denser, taller centre; irregularly spaced cottages and tree-lined streets outside.
    const lots=city.tiles.slice().sort((a,b)=>a.row-b.row || a.col-b.col);
    for(const {col:c,row:r} of lots) {
      const seed=atlasNoise(c,r), dist=chebyshev(c,r,city.center.col,city.center.row);
      const key=seed<.16?'grove':(dist<2.5 && seed>.24 || seed>.91)?'downtown':'village';
      const img=worldArt[key];
      if(!img) continue;
      const size=TILE*(key==='downtown'?1.22:.72+.35*seed);
      const x=(c+.48+.26*(seed-.5))*TILE, y=(r+.88+.16*atlasNoise(r,c))*TILE;
      ctx.save();ctx.translate(x,y);
      if(atlasNoise(c+24,r)>.52) ctx.scale(-1,1);
      ctx.drawImage(img,-size/2,-size,size,size);ctx.restore();
    }
  }
}
