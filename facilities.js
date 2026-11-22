// Raster miniatures use a common light direction and two image pixels per map pixel.
const worldArt = Object.create(null);
const artNames = 'gasTurbine ccgt coal nuclear smr solar wind ess interconnect village downtown grove meadow mountain-relief'.split(' ');
const worldArtReady = Promise.all(artNames.map(name => new Promise(resolve => {
  const img = new Image();
  img.onload = () => { worldArt[name === 'mountain-relief' ? 'mountainRelief' : name] = img; resolve(); };
  img.onerror = () => resolve();
  img.src = 'assets/world/' + name + (name === 'meadow' || name === 'mountain-relief' ? '.jpg' : '.png');   // 큰 바탕 그림 두 장은 jpg (산 그림 원본 png는 3.3MB라 0.5MB jpg로 다시 저장)
})));

function drawFacility(ctx,type,x,y,w,h) {
  const sprite = worldArt[type];
  if (sprite) {
    oval(ctx,'rgba(35,49,44,.24)',x+w*.52,y+h*.77,w*.41,h*.15);
    ctx.drawImage(sprite,x,y,w,h);
  }
  else { // Keep facilities visible during loading or when an image is unavailable.
    oval(ctx,PLANTS[type].color,x+w*.5,y+h*.6,w*.34,h*.25);
  }
}
