import test from 'node:test';
import assert from 'node:assert/strict';
import {bearingDeg,deltaHeading,haversineKm,projectPlaces,simulatedPositionForPlace} from '../js/ar-core.js';

const place={id:'torre',name:'Torre',lat:41.24482,lng:9.19207};

test('V1.4.8 GeoAR: la position simulée est proche du repère',()=>{
  const position=simulatedPositionForPlace(place);
  const distance=haversineKm(position,place);
  assert.ok(distance>0.02&&distance<0.08,`distance simulée ${distance} km`);
});

test('V1.4.8 GeoAR: un cap pointé vers le lieu projette le repère au centre',()=>{
  const position=simulatedPositionForPlace(place);
  const heading=bearingDeg(position,place);
  assert.ok(Math.abs(deltaHeading(heading,heading))<1e-9);
  const [projected]=projectPlaces({position,places:[place],heading,fov:72,maxDistanceKm:25});
  assert.equal(projected.visible,true);
  assert.ok(Math.abs(projected.x-.5)<1e-9,`x=${projected.x}`);
});

test('V1.4.8 GeoAR: un repère derrière le téléphone sort du champ',()=>{
  const position=simulatedPositionForPlace(place);
  const target=bearingDeg(position,place);
  const heading=(target+180)%360;
  const [projected]=projectPlaces({position,places:[place],heading,fov:72,maxDistanceKm:25});
  assert.equal(projected.visible,false);
});

test('V1.4.8 GeoAR: la distance est symétrique et finie',()=>{
  const a={lat:41.24,lng:9.18},b={lat:41.25,lng:9.19};
  const ab=haversineKm(a,b),ba=haversineKm(b,a);
  assert.ok(Number.isFinite(ab)&&ab>0);
  assert.ok(Math.abs(ab-ba)<1e-12);
});
