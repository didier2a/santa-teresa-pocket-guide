import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [page,css,shell,navigation]=await Promise.all([
  read('pocketguide-v23.html'),read('pocketguide-v233.css'),read('js/pg233/bootstrap/app.js'),read('js/pg233/ui/main-navigation.js')
]);

test('la navigation Figma conserve les trois destinations fonctionnelles',()=>{
  for(const target of ['companion','journey','memories'])assert.match(page,new RegExp(`data-view-target="${target}"`));
  for(const label of ['Compagnon','Voyage','Mes voyages'])assert.match(page,new RegExp(label));
});

test('le composant S22 respecte la géométrie et les états Figma',()=>{
  assert.match(css,/height:calc\(var\(--nav-height\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/width:48px;height:30px/);
  assert.match(css,/width:4px;height:4px/);
  assert.match(css,/font-size:12px;font-weight:700/);
});

test('toucher, avatar et voix partagent le même état de navigation',()=>{
  assert.match(shell,/installMainNavigation\(\)/);
  assert.match(navigation,/eventBus\.on\('ui\.panel\.changed'/);
  assert.match(navigation,/pocketGuideState\.select\('ui\.panel'\)/);
  assert.match(navigation,/aria-current/);
  assert.match(navigation,/ArrowLeft/);
});
