"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm");
const engine=require("../engine.js"), archive=require("../runs.json"), geo=require("../map.json");
const code=fs.readFileSync(require.resolve("../app.js"),"utf8");

async function page(search="",fail=false) {
  const elements=new Map(), errors=[];
  let interval=null, focused=null;
  class Element {
    constructor(tag,id="") { this.tag=tag;this.id=id;this.children=[];this.value="";this.hidden=false;this.classList={add(){}};this.attributes={}; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children=items;if(this.tag==="select"&&items.length&&!this.value)this.value=items[0].value; }
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,fn){this["on"+k]=fn;}
    focus(){focused=this.id;}
    scrollIntoView(){}
    click(){if(this.onclick)this.onclick();}
    remove(){}
  }
  const get=id=>{if(!elements.has(id))elements.set(id,new Element(["earlier","later","metric","region"].includes(id)?"select":"div",id));return elements.get(id);};
  get("metric").value="hdd";get("content").hidden=true;get("link-warning").hidden=true;
  const location={pathname:"/lab/weather/",search,hash:""};
  const context={document:{getElementById:get,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),body:new Element("body"),addEventListener(){}},
    Option:function(text,value){const e=new Element("option");e.textContent=text;e.value=value;return e;},
    WeatherEngine:engine,URLSearchParams,AbortController,Blob,
    URL:{createObjectURL:()=>"blob:fixture",revokeObjectURL(){}},location,
    history:{replaceState(_,__,url){location.search=url.slice(url.indexOf("?"));}},
    fetch:async path=>({ok:!fail,json:async()=>structuredClone(path==="runs.json"?archive:geo)}),
    setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{interval=fn;return 1;},clearInterval(){interval=null;},
    console:{error:err=>errors.push(err)}};
  await vm.runInNewContext(code,context);
  return {get,errors,location,tick(){if(interval)interval();},playing:()=>!!interval,focused:()=>focused};
}

test("page restores a shared comparison and preserves focus after state selection",async()=>{
  const p=await page("?earlier=2026-11-21T00:00:00Z&later=2026-11-22T00:00:00Z&metric=cdd&region=PA");
  assert.deepEqual(p.errors,[]);
  assert.equal(p.get("metric").value,"cdd");assert.equal(p.get("region").value,"PA");
  assert.ok(p.location.search.includes("metric=cdd"));
  p.get("statetbody").children[0].children[0].children[0].onclick();
  assert.equal(p.focused(),"headline");
});

test("invalid pair hides results and disables export instead of leaking the previous selection",async()=>{
  const p=await page();
  p.get("earlier").value=p.get("later").value;
  p.get("earlier").onchange();
  assert.equal(p.get("content").hidden,true);
  assert.equal(p.get("csv").disabled,true);
  assert.equal(p.get("next").disabled,false);
  assert.match(p.get("message").textContent,/follows/);
});

test("replay has an explicit restart and stops at the newest pair",async()=>{
  const p=await page();
  assert.equal(p.get("play").textContent,"Replay from first pair");
  p.get("play").onclick();
  assert.equal(p.get("earlier").value,engine.pairs(archive)[0][0]);
  for(let i=0;i<20&&p.playing();i++)p.tick();
  assert.equal(p.playing(),false);
  assert.equal(p.get("later").value,engine.pairs(archive).at(-1)[1]);
  assert.equal(p.get("next").disabled,true);
  p.get("back").onclick();
  p.get("play").onclick();
  assert.equal(p.playing(),false);
});

test("load failures leave unavailable controls disabled and a readable message",async()=>{
  const p=await page("",true);
  for(const id of ["earlier","later","metric","region","back","next","play","latest","csv"])
    assert.equal(p.get(id).disabled,true);
  assert.equal(p.get("content").hidden,true);
  assert.match(p.get("message").textContent,/could not be opened/);
});
