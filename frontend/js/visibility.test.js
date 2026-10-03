import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPORARY_STANDARD_PATTERNS } from './standard-patterns.js';
import { drawGaborPatch } from './gabor.js';

function image(pattern, patch) {
  const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:i=>{ctx.data=i.data;}};
  drawGaborPatch(ctx,200,200,2,{...patch,backgroundRGB:pattern.backgroundRGB,modulationAmplitude:patch.modulationAmplitude??pattern.modulationAmplitude},200);
  return ctx.data;
}
function bands(pattern, patch, bright) {
  const data=image(pattern,patch),centers=patch.visualLineCount===3?[-patch.lambda,0,patch.lambda]:[-1.5,-.5,.5,1.5].map(x=>x*patch.lambda);
  return centers.map(center=>{
    const values=[];
    for(let offset=-.25;offset<=.25;offset+=.01){
      const x=center+offset*patch.lambda,px=Math.round(200+x*200*Math.cos(patch.theta)),py=Math.round(200+x*200*Math.sin(patch.theta));
      const i=(py*400+px)*4;values.push((data[i]+data[i+1]+data[i+2])/3);
    }
    return bright?Math.max(...values):Math.min(...values);
  });
}

test('all three- and four-band rendered crests have strong dark or bright luminance',()=>{
  for(const[index,pattern]of TEMPORARY_STANDARD_PATTERNS.entries())for(const patch of pattern.patches){
    if(patch.visualLineCount<3)continue;
    const values=bands(pattern,patch,index===5);
    if(index===5)assert.ok(values.every(v=>v>=180),`Pattern 6 ${patch.id}: ${values}`);
    else assert.ok(values.every(v=>v<=100),`Pattern ${index+1} ${patch.id}: ${values}`);
  }
});

test('high-contrast stimuli still fade smoothly into their original Gaussian backgrounds',()=>{
  for(const pattern of TEMPORARY_STANDARD_PATTERNS)for(const patch of pattern.patches){
    const data=image(pattern,patch);
    for(const pixel of [0,399,399*400,400*400-1])for(let c=0;c<3;c++)assert.ok(Math.abs(data[pixel*4+c]-pattern.backgroundRGB[c])<=3);
    const intermediate=new Set();for(let i=0;i<data.length;i+=4)if(data[i]>20&&data[i]<230)intermediate.add(data[i]);
    assert.ok(intermediate.size>100,'Many continuous gray levels remain instead of flat hard bars');
  }
});
