/* ============================================================================
   WC2026 Travel Burden Lab — DATA (single source of truth)
   Pure data + assignment constraints. No React, no icon deps, so this module is
   importable by the browser app, the Node OG/data-gen scripts, and (via the
   generated tools/wc2026.data.json) the Python validator tools/milp.py.

   Data provenance:
     - Groups (A–L), home nations & base camps: CONFIRMED (draw, Mar 2026 playoffs;
       announced camps; Iran moved Tucson->Tijuana)
     - Home-origin / host / base-camp city geo, timezone, elevation: real
     - All 72 group-stage fixtures (teams, venue, date): CONFIRMED (official schedule)
     - wb (WBGT June heat proxy) per host: hand-set seasonal estimate (PROXY)
     - FIFA_RANK: Apr 2026 snapshot; top-20 + Canada published, rest ESTIMATED
============================================================================ */

// ---- City reference: [lat, lon, utcJune, elevM, country, wbgtJune] -----------
export const C = {
  // host cities
  LA:{n:"Los Angeles",lat:33.95,lon:-118.34,utc:-7,el:30,co:"USA",wb:22},
  SF:{n:"SF Bay",lat:37.40,lon:-121.97,utc:-7,el:8,co:"USA",wb:20},
  SEA:{n:"Seattle",lat:47.59,lon:-122.33,utc:-7,el:50,co:"USA",wb:18},
  VAN:{n:"Vancouver",lat:49.28,lon:-123.11,utc:-7,el:5,co:"CAN",wb:18},
  DAL:{n:"Dallas",lat:32.75,lon:-97.09,utc:-5,el:180,co:"USA",wb:29},
  HOU:{n:"Houston",lat:29.68,lon:-95.41,utc:-5,el:15,co:"USA",wb:31},
  KC:{n:"Kansas City",lat:39.05,lon:-94.48,utc:-5,el:270,co:"USA",wb:27},
  ATL:{n:"Atlanta",lat:33.76,lon:-84.40,utc:-4,el:320,co:"USA",wb:28},
  MIA:{n:"Miami",lat:25.96,lon:-80.24,utc:-4,el:2,co:"USA",wb:30},
  PHI:{n:"Philadelphia",lat:39.90,lon:-75.17,utc:-4,el:12,co:"USA",wb:26},
  BOS:{n:"Boston",lat:42.09,lon:-71.26,utc:-4,el:60,co:"USA",wb:23},
  NY:{n:"New York/NJ",lat:40.81,lon:-74.07,utc:-4,el:5,co:"USA",wb:25},
  TOR:{n:"Toronto",lat:43.63,lon:-79.42,utc:-4,el:76,co:"CAN",wb:24},
  MEX:{n:"Mexico City",lat:19.30,lon:-99.15,utc:-6,el:2240,co:"MEX",wb:19},
  GDL:{n:"Guadalajara",lat:20.68,lon:-103.46,utc:-6,el:1566,co:"MEX",wb:22},
  MTY:{n:"Monterrey",lat:25.67,lon:-100.24,utc:-6,el:540,co:"MEX",wb:30},
  // home origins
  Johannesburg:{n:"Johannesburg",lat:-26.2,lon:28.0,utc:2},
  Seoul:{n:"Seoul",lat:37.57,lon:126.98,utc:9},
  Prague:{n:"Prague",lat:50.08,lon:14.44,utc:2},
  Zurich:{n:"Zurich",lat:47.37,lon:8.54,utc:2},
  Doha:{n:"Doha",lat:25.29,lon:51.53,utc:3},
  Sarajevo:{n:"Sarajevo",lat:43.86,lon:18.41,utc:2},
  Rio:{n:"Rio de Janeiro",lat:-22.91,lon:-43.17,utc:-3},
  Casablanca:{n:"Casablanca",lat:33.57,lon:-7.59,utc:1},
  PortAuPrince:{n:"Port-au-Prince",lat:18.59,lon:-72.31,utc:-4},
  Glasgow:{n:"Glasgow",lat:55.86,lon:-4.25,utc:1},
  Berlin:{n:"Berlin",lat:52.52,lon:13.40,utc:2},
  Willemstad:{n:"Willemstad",lat:12.11,lon:-68.93,utc:-4},
  Abidjan:{n:"Abidjan",lat:5.35,lon:-4.00,utc:0},
  Quito:{n:"Quito",lat:-0.18,lon:-78.47,utc:-5},
  Amsterdam:{n:"Amsterdam",lat:52.37,lon:4.90,utc:2},
  Tokyo:{n:"Tokyo",lat:35.68,lon:139.69,utc:9},
  Stockholm:{n:"Stockholm",lat:59.33,lon:18.07,utc:2},
  Tunis:{n:"Tunis",lat:36.81,lon:10.18,utc:1},
  Brussels:{n:"Brussels",lat:50.85,lon:4.35,utc:2},
  Cairo:{n:"Cairo",lat:30.04,lon:31.24,utc:3},
  Tehran:{n:"Tehran",lat:35.69,lon:51.39,utc:3.5},
  Auckland:{n:"Auckland",lat:-36.85,lon:174.76,utc:12},
  Madrid:{n:"Madrid",lat:40.42,lon:-3.70,utc:2},
  Praia:{n:"Praia",lat:14.93,lon:-23.51,utc:-1},
  Riyadh:{n:"Riyadh",lat:24.71,lon:46.68,utc:3},
  Montevideo:{n:"Montevideo",lat:-34.90,lon:-56.16,utc:-3},
  Paris:{n:"Paris",lat:48.85,lon:2.35,utc:2},
  Dakar:{n:"Dakar",lat:14.69,lon:-17.45,utc:0},
  Oslo:{n:"Oslo",lat:59.91,lon:10.75,utc:2},
  Baghdad:{n:"Baghdad",lat:33.31,lon:44.36,utc:3},
  BuenosAires:{n:"Buenos Aires",lat:-34.60,lon:-58.38,utc:-3},
  Algiers:{n:"Algiers",lat:36.75,lon:3.06,utc:1},
  Vienna:{n:"Vienna",lat:48.21,lon:16.37,utc:2},
  Amman:{n:"Amman",lat:31.95,lon:35.93,utc:3},
  Lisbon:{n:"Lisbon",lat:38.72,lon:-9.14,utc:1},
  Kinshasa:{n:"Kinshasa",lat:-4.32,lon:15.31,utc:1},
  Tashkent:{n:"Tashkent",lat:41.31,lon:69.24,utc:5},
  Bogota:{n:"Bogota",lat:4.71,lon:-74.07,utc:-5},
  London:{n:"London",lat:51.51,lon:-0.13,utc:1},
  Zagreb:{n:"Zagreb",lat:45.81,lon:15.98,utc:2},
  Accra:{n:"Accra",lat:5.60,lon:-0.19,utc:0},
  PanamaCity:{n:"Panama City",lat:8.98,lon:-79.52,utc:-5},
  Sydney:{n:"Sydney",lat:-33.87,lon:151.21,utc:10},
  Asuncion:{n:"Asuncion",lat:-25.30,lon:-57.64,utc:-4},
  // base-camp cities (real, announced) — lat/lon/utcJune/elevation
  PCK:{n:"Pachuca",lat:20.10,lon:-98.76,utc:-6,el:2400,co:"MEX"},
  SAN:{n:"San Diego",lat:32.72,lon:-117.16,utc:-7,el:20,co:"USA"},
  SBA:{n:"Santa Barbara",lat:34.43,lon:-119.71,utc:-7,el:15,co:"USA"},
  SLC:{n:"Salt Lake City",lat:40.76,lon:-111.89,utc:-6,el:1288,co:"USA"},
  ACY:{n:"Atlantic City",lat:39.36,lon:-74.42,utc:-4,el:3,co:"USA"},
  CLT:{n:"Charlotte",lat:35.23,lon:-80.84,utc:-4,el:229,co:"USA"},
  IRV:{n:"Irvine",lat:33.68,lon:-117.83,utc:-7,el:17,co:"USA"},
  MESA:{n:"Mesa",lat:33.42,lon:-111.83,utc:-7,el:360,co:"USA"},
  WS:{n:"Winston-Salem",lat:36.10,lon:-80.24,utc:-4,el:297,co:"USA"},
  BOCA:{n:"Boca Raton",lat:26.36,lon:-80.08,utc:-4,el:4,co:"USA"},
  COL:{n:"Columbus",lat:39.96,lon:-82.99,utc:-4,el:275,co:"USA"},
  NAS:{n:"Nashville",lat:36.16,lon:-86.78,utc:-5,el:169,co:"USA"},
  SPO:{n:"Spokane",lat:47.66,lon:-117.43,utc:-7,el:581,co:"USA"},
  TIJ:{n:"Tijuana",lat:32.51,lon:-117.04,utc:-7,el:30,co:"MEX"},
  CHA:{n:"Chattanooga",lat:35.05,lon:-85.31,utc:-5,el:207,co:"USA"},
  TPA:{n:"Tampa",lat:27.95,lon:-82.46,utc:-4,el:15,co:"USA"},
  AUS:{n:"Austin",lat:30.27,lon:-97.74,utc:-5,el:149,co:"USA"},
  PDC:{n:"Playa del Carmen",lat:20.63,lon:-87.07,utc:-5,el:10,co:"MEX"},
  GSO:{n:"Greensboro",lat:36.07,lon:-79.79,utc:-4,el:270,co:"USA"},
  WSS:{n:"White Sulphur Springs",lat:37.78,lon:-80.30,utc:-4,el:600,co:"USA"},
  POR:{n:"Portland",lat:45.52,lon:-122.68,utc:-7,el:15,co:"USA"},
  ALX:{n:"Alexandria",lat:38.80,lon:-77.05,utc:-4,el:10,co:"USA"},
  PBG:{n:"Palm Beach Gardens",lat:26.82,lon:-80.14,utc:-4,el:5,co:"USA"},
  PVD:{n:"Providence",lat:41.82,lon:-71.41,utc:-4,el:18,co:"USA"},
};

export const BASE_CHOICES = Object.keys(C).filter((k)=>C[k].el!=null).sort((a,b)=>C[a].n.localeCompare(C[b].n));

// real announced base camp per team (reuses host-city keys where the camp shares that metro)
export const BASES = {
  "Mexico":"MEX","South Africa":"PCK","South Korea":"GDL","Czechia":"DAL",
  "Canada":"VAN","Switzerland":"SAN","Qatar":"SBA","Bosnia & Herz.":"SLC",
  "Brazil":"NY","Morocco":"NY","Haiti":"ACY","Scotland":"CLT",
  "United States":"IRV","Paraguay":"SF","Australia":"SF","Türkiye":"MESA",
  "Germany":"WS","Curaçao":"BOCA","Ivory Coast":"PHI","Ecuador":"COL",
  "Netherlands":"KC","Japan":"NAS","Sweden":"DAL","Tunisia":"MTY",
  "Belgium":"SEA","Egypt":"SPO","Iran":"TIJ","New Zealand":"SAN",
  "Spain":"CHA","Cape Verde":"TPA","Saudi Arabia":"AUS","Uruguay":"PDC",
  "France":"BOS","Senegal":"NY","Norway":"GSO","Iraq":"WSS",
  "Argentina":"KC","Algeria":"KC","Austria":"SBA","Jordan":"POR",
  "Portugal":"PBG","DR Congo":"HOU","Uzbekistan":"ATL","Colombia":"GDL",
  "England":"KC","Croatia":"ALX","Ghana":"PVD","Panama":"TOR",
};

// ---- Teams: confirmed groups & home origins ---------------------------------
export const TEAMS = [
  {t:"Mexico",f:"🇲🇽",cf:"CONCACAF",g:"A",o:"MEX"},
  {t:"South Africa",f:"🇿🇦",cf:"CAF",g:"A",o:"Johannesburg"},
  {t:"South Korea",f:"🇰🇷",cf:"AFC",g:"A",o:"Seoul"},
  {t:"Czechia",f:"🇨🇿",cf:"UEFA",g:"A",o:"Prague"},
  {t:"Canada",f:"🇨🇦",cf:"CONCACAF",g:"B",o:"TOR"},
  {t:"Switzerland",f:"🇨🇭",cf:"UEFA",g:"B",o:"Zurich"},
  {t:"Qatar",f:"🇶🇦",cf:"AFC",g:"B",o:"Doha"},
  {t:"Bosnia & Herz.",f:"🇧🇦",cf:"UEFA",g:"B",o:"Sarajevo"},
  {t:"Brazil",f:"🇧🇷",cf:"CONMEBOL",g:"C",o:"Rio"},
  {t:"Morocco",f:"🇲🇦",cf:"CAF",g:"C",o:"Casablanca"},
  {t:"Haiti",f:"🇭🇹",cf:"CONCACAF",g:"C",o:"PortAuPrince"},
  {t:"Scotland",f:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",cf:"UEFA",g:"C",o:"Glasgow"},
  {t:"United States",f:"🇺🇸",cf:"CONCACAF",g:"D",o:"LA"},
  {t:"Paraguay",f:"🇵🇾",cf:"CONMEBOL",g:"D",o:"Asuncion"},
  {t:"Australia",f:"🇦🇺",cf:"AFC",g:"D",o:"Sydney"},
  {t:"Türkiye",f:"🇹🇷",cf:"UEFA",g:"D",o:"Vienna"}, // camps in Europe; origin proxy
  {t:"Germany",f:"🇩🇪",cf:"UEFA",g:"E",o:"Berlin"},
  {t:"Curaçao",f:"🇨🇼",cf:"CONCACAF",g:"E",o:"Willemstad"},
  {t:"Ivory Coast",f:"🇨🇮",cf:"CAF",g:"E",o:"Abidjan"},
  {t:"Ecuador",f:"🇪🇨",cf:"CONMEBOL",g:"E",o:"Quito"},
  {t:"Netherlands",f:"🇳🇱",cf:"UEFA",g:"F",o:"Amsterdam"},
  {t:"Japan",f:"🇯🇵",cf:"AFC",g:"F",o:"Tokyo"},
  {t:"Sweden",f:"🇸🇪",cf:"UEFA",g:"F",o:"Stockholm"},
  {t:"Tunisia",f:"🇹🇳",cf:"CAF",g:"F",o:"Tunis"},
  {t:"Belgium",f:"🇧🇪",cf:"UEFA",g:"G",o:"Brussels"},
  {t:"Egypt",f:"🇪🇬",cf:"CAF",g:"G",o:"Cairo"},
  {t:"Iran",f:"🇮🇷",cf:"AFC",g:"G",o:"Tehran"},
  {t:"New Zealand",f:"🇳🇿",cf:"OFC",g:"G",o:"Auckland"},
  {t:"Spain",f:"🇪🇸",cf:"UEFA",g:"H",o:"Madrid"},
  {t:"Cape Verde",f:"🇨🇻",cf:"CAF",g:"H",o:"Praia"},
  {t:"Saudi Arabia",f:"🇸🇦",cf:"AFC",g:"H",o:"Riyadh"},
  {t:"Uruguay",f:"🇺🇾",cf:"CONMEBOL",g:"H",o:"Montevideo"},
  {t:"France",f:"🇫🇷",cf:"UEFA",g:"I",o:"Paris"},
  {t:"Senegal",f:"🇸🇳",cf:"CAF",g:"I",o:"Dakar"},
  {t:"Norway",f:"🇳🇴",cf:"UEFA",g:"I",o:"Oslo"},
  {t:"Iraq",f:"🇮🇶",cf:"AFC",g:"I",o:"Baghdad"},
  {t:"Argentina",f:"🇦🇷",cf:"CONMEBOL",g:"J",o:"BuenosAires"},
  {t:"Algeria",f:"🇩🇿",cf:"CAF",g:"J",o:"Algiers"},
  {t:"Austria",f:"🇦🇹",cf:"UEFA",g:"J",o:"Vienna"},
  {t:"Jordan",f:"🇯🇴",cf:"AFC",g:"J",o:"Amman"},
  {t:"Portugal",f:"🇵🇹",cf:"UEFA",g:"K",o:"Lisbon"},
  {t:"DR Congo",f:"🇨🇩",cf:"CAF",g:"K",o:"Kinshasa"},
  {t:"Uzbekistan",f:"🇺🇿",cf:"AFC",g:"K",o:"Tashkent"},
  {t:"Colombia",f:"🇨🇴",cf:"CONMEBOL",g:"K",o:"Bogota"},
  {t:"England",f:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",cf:"UEFA",g:"L",o:"London"},
  {t:"Croatia",f:"🇭🇷",cf:"UEFA",g:"L",o:"Zagreb"},
  {t:"Ghana",f:"🇬🇭",cf:"CAF",g:"L",o:"Accra"},
  {t:"Panama",f:"🇵🇦",cf:"CONCACAF",g:"L",o:"PanamaCity"},
];

// FIFA world ranking snapshot (1 Apr 2026 — last pre-tournament update).
// Top 20 + Canada are the published values; teams below ~20 are approximate.
export const FIFA_RANK = {
  "France":1,"Spain":2,"Argentina":3,"England":4,"Portugal":5,"Brazil":6,"Netherlands":7,
  "Morocco":8,"Belgium":9,"Germany":10,"Croatia":11,"Colombia":13,"Senegal":14,"Mexico":15,
  "United States":16,"Uruguay":17,"Japan":18,"Switzerland":19,"Iran":21,"Austria":22,"Ecuador":23,
  "South Korea":24,"Australia":25,"Türkiye":26,"Norway":28,"Canada":30,"Egypt":32,"Scotland":33,
  "Qatar":35,"Algeria":37,"Paraguay":38,"Sweden":40,"Tunisia":41,"Ivory Coast":42,"Czechia":43,
  "DR Congo":56,"Uzbekistan":57,"Saudi Arabia":58,"Iraq":59,"South Africa":61,"Jordan":64,
  "Cape Verde":70,"Ghana":73,"Bosnia & Herz.":74,"Panama":78,"Curaçao":82,"New Zealand":86,"Haiti":90,
};

// match mnemonic prefix (group stage = G; future stages: R32, R16, QF, SF, F)
export const STAGE = "G";

// ---- Real WC2026 group-stage fixtures: [day, group, home, away, cityKey] ----
export const FIXTURES=[
  [11,"A","Mexico","South Africa","MEX"],
  [11,"A","South Korea","Czechia","GDL"],
  [12,"B","Canada","Bosnia & Herz.","TOR"],
  [12,"D","United States","Paraguay","LA"],
  [13,"C","Brazil","Morocco","NY"],
  [13,"D","Australia","Türkiye","VAN"],
  [13,"C","Haiti","Scotland","BOS"],
  [13,"B","Qatar","Switzerland","SF"],
  [14,"E","Germany","Curaçao","HOU"],
  [14,"E","Ivory Coast","Ecuador","PHI"],
  [14,"F","Netherlands","Japan","DAL"],
  [14,"F","Sweden","Tunisia","MTY"],
  [15,"H","Spain","Cape Verde","ATL"],
  [15,"G","Belgium","Egypt","SEA"],
  [15,"H","Saudi Arabia","Uruguay","MIA"],
  [15,"G","Iran","New Zealand","LA"],
  [16,"I","France","Senegal","NY"],
  [16,"I","Iraq","Norway","BOS"],
  [16,"J","Argentina","Algeria","KC"],
  [16,"J","Austria","Jordan","SF"],
  [17,"K","Portugal","DR Congo","HOU"],
  [17,"L","England","Croatia","DAL"],
  [17,"L","Ghana","Panama","TOR"],
  [17,"K","Uzbekistan","Colombia","MEX"],
  [18,"A","Czechia","South Africa","ATL"],
  [18,"B","Switzerland","Bosnia & Herz.","LA"],
  [18,"B","Canada","Qatar","VAN"],
  [18,"A","Mexico","South Korea","GDL"],
  [19,"D","United States","Australia","SEA"],
  [19,"C","Scotland","Morocco","BOS"],
  [19,"C","Brazil","Haiti","PHI"],
  [19,"D","Türkiye","Paraguay","SF"],
  [20,"F","Netherlands","Sweden","HOU"],
  [20,"E","Germany","Ivory Coast","TOR"],
  [20,"E","Ecuador","Curaçao","KC"],
  [20,"F","Tunisia","Japan","MTY"],
  [21,"H","Spain","Saudi Arabia","ATL"],
  [21,"G","Belgium","Iran","LA"],
  [21,"H","Uruguay","Cape Verde","MIA"],
  [21,"G","New Zealand","Egypt","VAN"],
  [22,"J","Argentina","Austria","DAL"],
  [22,"I","France","Iraq","PHI"],
  [22,"I","Norway","Senegal","NY"],
  [22,"J","Jordan","Algeria","SF"],
  [23,"K","Portugal","Uzbekistan","HOU"],
  [23,"L","England","Ghana","BOS"],
  [23,"L","Panama","Croatia","TOR"],
  [23,"K","Colombia","DR Congo","GDL"],
  [24,"B","Canada","Switzerland","VAN"],
  [24,"B","Bosnia & Herz.","Qatar","SEA"],
  [24,"C","Scotland","Brazil","MIA"],
  [24,"C","Morocco","Haiti","ATL"],
  [24,"A","Mexico","Czechia","MEX"],
  [24,"A","South Korea","South Africa","MTY"],
  [25,"E","Ecuador","Germany","NY"],
  [25,"E","Curaçao","Ivory Coast","PHI"],
  [25,"F","Tunisia","Netherlands","KC"],
  [25,"F","Japan","Sweden","DAL"],
  [25,"D","United States","Türkiye","LA"],
  [25,"D","Paraguay","Australia","SF"],
  [26,"I","Norway","France","BOS"],
  [26,"I","Senegal","Iraq","TOR"],
  [26,"G","New Zealand","Belgium","VAN"],
  [26,"G","Egypt","Iran","SEA"],
  [26,"H","Uruguay","Spain","GDL"],
  [26,"H","Cape Verde","Saudi Arabia","HOU"],
  [27,"L","Panama","England","NY"],
  [27,"L","Croatia","Ghana","PHI"],
  [27,"K","Colombia","Portugal","MIA"],
  [27,"K","DR Congo","Uzbekistan","ATL"],
  [27,"J","Jordan","Argentina","DAL"],
  [27,"J","Algeria","Austria","KC"],
];

// Baked CBC reference solution (regenerated by tools/milp.py -> tools/fixtures.js).
export const MILP_OPT=["MEX","GDL","VAN","SF","NY","LA","BOS","SF","ATL","TOR","DAL","KC","ATL","VAN","DAL","LA","NY","PHI","KC","LA","TOR","NY","BOS","GDL","MTY","LA","TOR","GDL","SF","NY","PHI","LA","ATL","BOS","PHI","DAL","ATL","VAN","DAL","SF","LA","NY","TOR","SEA","ATL","TOR","PHI","GDL","TOR","LA","PHI","NY","MTY","GDL","NY","PHI","KC","ATL","LA","SF","BOS","NY","SEA","LA","ATL","TOR","NY","PHI","GDL","DAL","LA","SEA"];
export const MILP_AUDIT={"actualMax": 27.61, "actualMin": 1.3, "actualGap": 26.31, "optMax": 20.7, "optMin": 0.0, "optGap": 20.7, "moved": 49};

// ---- Real fixtures -> per-team schedule + assignment constraints ------------
export const US_CITIES=["LA","SF","SEA","DAL","HOU","KC","ATL","MIA","PHI","BOS","NY"];
export const MX_CITIES=["MEX","GDL","MTY"], CA_CITIES=["TOR","VAN"];
export const ALL_HOSTS=[...US_CITIES,...MX_CITIES,...CA_CITIES];

// each match's allowed venues — host nations are kept in their own country
export function allowedCities(home,away){
  if(home==="Mexico"||away==="Mexico") return MX_CITIES;
  if(home==="Canada"||away==="Canada") return CA_CITIES;
  if(home==="United States"||away==="United States") return US_CITIES;
  return ALL_HOSTS;
}

// team -> its fixture indices, ordered by date
export const TEAM_MATCHES={};
FIXTURES.forEach((f,i)=>{ [f[2],f[3]].forEach((t)=>{(TEAM_MATCHES[t]=TEAM_MATCHES[t]||[]).push(i);}); });
Object.values(TEAM_MATCHES).forEach((a)=>a.sort((p,q)=>FIXTURES[p][0]-FIXTURES[q][0]));

export const ACTUAL_CITY = FIXTURES.map((f)=>f[4]);   // the real FIFA venue assignment
export const MATCH_DAYS  = FIXTURES.map((f)=>f[0]);
