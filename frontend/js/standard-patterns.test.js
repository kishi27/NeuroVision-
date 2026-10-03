import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TEMPORARY_STANDARD_PATTERNS, STANDARD_LINE_BASES, createStandardRoundPattern, selectionSignature } from './standard-patterns.js';
import { GaborTouchSession } from './session.js';
import { drawGaborPatch } from './gabor.js';

function randomGenerator(seed=7391) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32; };
}
function render(pattern,patch) {
  const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:i=>{ctx.data=i.data;}};
  drawGaborPatch(ctx,200,200,2,{...patch,backgroundRGB:pattern.backgroundRGB},200);
  return ctx.data;
}

test('every pattern renders one through four dominant bands, with extra lobes below three RGB levels',()=>{
  for(const [index,pattern] of TEMPORARY_STANDARD_PATTERNS.entries())for(const patch of pattern.patches){
    const data=render(pattern,patch),values=[];
    // Sample actual renderer pixels across the carrier axis. Visible bands
    // exceed 15 RGB levels; omitted crests must stay below three levels.
    for(let j=0;j<=1200;j++){
      const x=-.98+j*1.96/1200;
      const px=Math.round(200+x*200*Math.cos(patch.theta)),py=Math.round(200+x*200*Math.sin(patch.theta));
      const pixel=(py*400+px)*4;
      values.push((index===5?1:-1)*((data[pixel]+data[pixel+1]+data[pixel+2]-pattern.backgroundRGB.reduce((a,b)=>a+b,0))/3));
    }
    let groups=0,inside=false;
    for(const value of values){if(value>15&&!inside)groups++;inside=value>15;}
    assert.equal(groups,patch.visualLineCount,`Pattern ${index+1} ${patch.id}`);
    const a=[];
    for(let j=0;j<=10000;j++){
      const x=-1+j/5000;
      a.push((index===5?1:-1)*Math.exp(-x*x/(2*patch.sigma**2))*Math.cos(2*Math.PI*x/patch.lambda+patch.psi)*patch.contrast*patch.modulationAmplitude);
    }
    const peaks=a.filter((v,i)=>i>0&&i<a.length-1&&v>a[i-1]&&v>=a[i+1]&&v>0);
    assert.equal(peaks.filter(v=>v>15).length,patch.visualLineCount);
    assert.ok(peaks.filter(v=>v<=15).every(v=>v<3));
  }
});

test('unchanged theme colors use strict stripe directions and distinct Gaussian shape variants',()=>{
  const backgrounds=[[248,248,245],[173,231,231],[245,244,237],[244,242,202],[202,202,206],[18,18,20]];
  for(const[index,pattern]of TEMPORARY_STANDARD_PATTERNS.entries()){
    assert.deepEqual(pattern.backgroundRGB,backgrounds[index]);
    for(const patch of pattern.patches){
      assert.ok([0,45,90].includes(patch.orientationDegrees));
      assert.equal(patch.theta,(90-patch.orientationDegrees)*Math.PI/180);
      assert.equal(patch.lambda,STANDARD_LINE_BASES[patch.visualLineCount].lambda);
      assert.ok(Object.isFrozen(patch));
    }
    for(const n of [3,4]){
      const [a,b]=pattern.patches.filter(p=>p.visualLineCount===n);
      assert.equal(a.orientationDegrees,b.orientationDegrees);
      assert.notEqual(a.gamma,b.gamma);
    }
  }
});

test('both shuffled copies of every randomly generated pair have identical full parameters and pixels',()=>{
  const game=new GaborTouchSession(randomGenerator());game.start();
  for(let round=1;round<=12;round++){
    if(round>1){game.round=round;game.beginRound();}
    const pattern=game.pattern,images=new Map();
    for(const patch of pattern.patches)images.set(patch.id,createHash('sha256').update(render(pattern,patch)).digest('hex'));
    assert.equal(new Set(images.values()).size,6);
    for(const pair of Map.groupBy(game.panels,p=>p.pairId).values()){
      assert.equal(pair.length,2);
      assert.deepEqual(pattern.patches.find(p=>p.id===pair[0].pairId),pattern.patches.find(p=>p.id===pair[1].pairId));
      assert.equal(images.get(pair[0].pairId),images.get(pair[1].pairId));
    }
  }
});

test('1000 random rounds contain at least three line counts, repeated directions and six unique pair parameter sets',()=>{
  const random=randomGenerator(),distributions=new Set(),seenCounts=new Set();let previous;
  for(let round=1;round<=1000;round++){
    const pattern=createStandardRoundPattern(round,random,previous),patches=pattern.patches;
    assert.equal(patches.length,6);
    assert.ok(new Set(patches.map(p=>p.visualLineCount)).size>=3);
    for(const n of patches.map(p=>p.visualLineCount)){assert.ok([1,2,3,4].includes(n));seenCounts.add(n);}
    assert.deepEqual(patches.map(p=>p.orientationDegrees).sort((a,b)=>a-b),[0,0,45,45,90,90]);
    assert.equal(new Set(patches.map(({id,...params})=>JSON.stringify(params))).size,6);
    const signature=selectionSignature(patches);assert.notEqual(signature,previous);previous=signature;
    distributions.add(patches.map(p=>p.visualLineCount).sort().join(','));
  }
  assert.deepEqual([...seenCounts].sort(),[1,2,3,4]);assert.ok(distributions.size>10);
});

test('a constant RNG still changes adjacent round combinations without retrying forever',()=>{
  for(const value of [0,.5,.999999]){
    let previous;
    for(let round=1;round<=12;round++){
      const pattern=createStandardRoundPattern(round,()=>value,previous),signature=selectionSignature(pattern.patches);
      assert.notEqual(signature,previous);assert.ok(new Set(pattern.patches.map(p=>p.visualLineCount)).size>=3);previous=signature;
    }
  }
});

test('each theme repeats after six rounds while stimulus combinations are generated anew',()=>{
  const random=randomGenerator();let previous;
  for(let round=1;round<=12;round++){
    const pattern=createStandardRoundPattern(round,random,previous);
    assert.deepEqual(pattern.backgroundRGB,TEMPORARY_STANDARD_PATTERNS[(round-1)%6].backgroundRGB);
    previous=selectionSignature(pattern.patches);
  }
});

test('all 144 theme/count/direction/shape combinations render exactly one to four visible bands',()=>{
  for(const[index,pattern]of TEMPORARY_STANDARD_PATTERNS.entries())for(const n of [1,2,3,4])for(const angle of [0,45,90])for(const gamma of STANDARD_LINE_BASES[n].gammas){
    const base=STANDARD_LINE_BASES[n],patch={lambda:base.lambda,sigma:base.sigma,gamma,theta:(90-angle)*Math.PI/180,
      psi:index===5?(base.darkPhase+Math.PI)%(2*Math.PI):base.darkPhase,
      contrast:Math.min(...pattern.contrasts),modulationAmplitude:pattern.modulationAmplitude*base.excursionScale};
    const data=render(pattern,patch);let groups=0,inside=false,minExcursion=Infinity,currentPeak=0;
    for(let j=0;j<=1600;j++){
      const x=-.98+j*1.96/1600,px=Math.round(200+x*200*Math.cos(patch.theta)),py=Math.round(200+x*200*Math.sin(patch.theta)),i=(py*400+px)*4;
      const value=(index===5?1:-1)*(data[i]+data[i+1]+data[i+2]-pattern.backgroundRGB.reduce((a,b)=>a+b,0))/3;
      if(value>15&&!inside){groups++;currentPeak=0;}
      if(value>15)currentPeak=Math.max(currentPeak,value);
      if(value<=15&&inside)minExcursion=Math.min(minExcursion,currentPeak);
      inside=value>15;
    }
    assert.equal(groups,n,`Pattern ${index+1}, ${n} lines, ${angle} degrees, gamma ${gamma}`);
    assert.ok(minExcursion>150,'Every intended band retains strong contrast');
  }
});
