import re, math, json
import pulp

import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "..", "src", "wc2026_travel_burden_lab.jsx")).read()

# ---- parse C (city geo) ----
C = {}
for m in re.finditer(r'^\s*([A-Za-z]\w*):\{(n:"[^"]*".*?)\},?\s*$', SRC, re.M):
    key, body = m.group(1), m.group(2)
    def g(p):
        mm = re.search(p+r':(-?\d+(?:\.\d+)?)', body); return float(mm.group(1)) if mm else None
    nm = re.search(r'n:"([^"]*)"', body)
    if not nm: continue
    C[key] = dict(n=nm.group(1), lat=g('lat'), lon=g('lon'), utc=g('utc'), el=g('el'), wb=g('wb'))
# keep only entries that have lat/lon (real cities)
C = {k:v for k,v in C.items() if v['lat'] is not None}

# ---- parse BASES ----
bm = re.search(r'const BASES = \{(.*?)\};', SRC, re.S)
BASES = dict(re.findall(r'"([^"]+)":"(\w+)"', bm.group(1)))

# ---- parse TEAMS (name, group, origin) ----
TEAMS = {}
for m in re.finditer(r'\{t:"([^"]+)",f:"[^"]*",cf:"([^"]+)",g:"([A-L])",o:"(\w+)"\}', SRC):
    TEAMS[m.group(1)] = dict(cf=m.group(2), g=m.group(3), o=m.group(4))
assert len(TEAMS)==48, len(TEAMS)

# ---- defaults (mirror DEFAULT_H / DEFAULT_W / REF / lead) ----
H = dict(aE=1.0,aW=0.6,kappa=1.0,delta=0.5,tau=2.0,thetaHeat=28,h0=1500,bExp=1.0,bTrans=0.5,gMin=4)
W = dict(jet=0.30,travel=0.30,heat=0.15,alt=0.15,cong=0.10)
REF = dict(jet=12,travel=25,heat=12,alt=25,cong=6)
LEAD = 7

HOSTS = ["LA","SF","SEA","VAN","DAL","HOU","KC","ATL","MIA","PHI","BOS","NY","TOR","MEX","GDL","MTY"]
US = ["LA","SF","SEA","DAL","HOU","KC","ATL","MIA","PHI","BOS","NY"]
MX = ["MEX","GDL","MTY"]; CA = ["TOR","VAN"]

# ---- 72 real group-stage fixtures: (day, group, home, away, cityKey) ----
# playoff slots resolved: UEFA-D=Czechia, UEFA-A=Bosnia & Herz., UEFA-C=Türkiye,
# UEFA-B=Sweden, FIFA-1=DR Congo, FIFA-2=Iraq.  Source: USA TODAY / AOL schedule.
F = [
 (11,"A","Mexico","South Africa","MEX"),(11,"A","South Korea","Czechia","GDL"),
 (12,"B","Canada","Bosnia & Herz.","TOR"),(12,"D","United States","Paraguay","LA"),
 (13,"C","Brazil","Morocco","NY"),(13,"D","Australia","Türkiye","VAN"),
 (13,"C","Haiti","Scotland","BOS"),(13,"B","Qatar","Switzerland","SF"),
 (14,"E","Germany","Curaçao","HOU"),(14,"E","Ivory Coast","Ecuador","PHI"),
 (14,"F","Netherlands","Japan","DAL"),(14,"F","Sweden","Tunisia","MTY"),
 (15,"H","Spain","Cape Verde","ATL"),(15,"G","Belgium","Egypt","SEA"),
 (15,"H","Saudi Arabia","Uruguay","MIA"),(15,"G","Iran","New Zealand","LA"),
 (16,"I","France","Senegal","NY"),(16,"I","Iraq","Norway","BOS"),
 (16,"J","Argentina","Algeria","KC"),(16,"J","Austria","Jordan","SF"),
 (17,"K","Portugal","DR Congo","HOU"),(17,"L","England","Croatia","DAL"),
 (17,"L","Ghana","Panama","TOR"),(17,"K","Uzbekistan","Colombia","MEX"),
 (18,"A","Czechia","South Africa","ATL"),(18,"B","Switzerland","Bosnia & Herz.","LA"),
 (18,"B","Canada","Qatar","VAN"),(18,"A","Mexico","South Korea","GDL"),
 (19,"D","United States","Australia","SEA"),(19,"C","Scotland","Morocco","BOS"),
 (19,"C","Brazil","Haiti","PHI"),(19,"D","Türkiye","Paraguay","SF"),
 (20,"F","Netherlands","Sweden","HOU"),(20,"E","Germany","Ivory Coast","TOR"),
 (20,"E","Ecuador","Curaçao","KC"),(20,"F","Tunisia","Japan","MTY"),
 (21,"H","Spain","Saudi Arabia","ATL"),(21,"G","Belgium","Iran","LA"),
 (21,"H","Uruguay","Cape Verde","MIA"),(21,"G","New Zealand","Egypt","VAN"),
 (22,"J","Argentina","Austria","DAL"),(22,"I","France","Iraq","PHI"),
 (22,"I","Norway","Senegal","NY"),(22,"J","Jordan","Algeria","SF"),
 (23,"K","Portugal","Uzbekistan","HOU"),(23,"L","England","Ghana","BOS"),
 (23,"L","Panama","Croatia","TOR"),(23,"K","Colombia","DR Congo","GDL"),
 (24,"B","Canada","Switzerland","VAN"),(24,"B","Bosnia & Herz.","Qatar","SEA"),
 (24,"C","Scotland","Brazil","MIA"),(24,"C","Morocco","Haiti","ATL"),
 (24,"A","Mexico","Czechia","MEX"),(24,"A","South Korea","South Africa","MTY"),
 (25,"E","Ecuador","Germany","NY"),(25,"E","Curaçao","Ivory Coast","PHI"),
 (25,"F","Tunisia","Netherlands","KC"),(25,"F","Japan","Sweden","DAL"),
 (25,"D","United States","Türkiye","LA"),(25,"D","Paraguay","Australia","SF"),
 (26,"I","Norway","France","BOS"),(26,"I","Senegal","Iraq","TOR"),
 (26,"G","New Zealand","Belgium","VAN"),(26,"G","Egypt","Iran","SEA"),
 (26,"H","Uruguay","Spain","GDL"),(26,"H","Cape Verde","Saudi Arabia","HOU"),
 (27,"L","Panama","England","NY"),(27,"L","Croatia","Ghana","PHI"),
 (27,"K","Colombia","Portugal","MIA"),(27,"K","DR Congo","Uzbekistan","ATL"),
 (27,"J","Jordan","Argentina","DAL"),(27,"J","Algeria","Austria","KC"),
]
assert len(F)==72, len(F)

# ---- integrity checks ----
from collections import defaultdict, Counter
cnt = Counter(); gcnt = defaultdict(set)
for d,g,h,a,c in F:
    cnt[h]+=1; cnt[a]+=1; gcnt[g].add((h,a))
    assert h in TEAMS and a in TEAMS, (h,a)
    assert TEAMS[h]['g']==g and TEAMS[a]['g']==g, (h,a,g)
    assert c in HOSTS, c
bad = {t:n for t,n in cnt.items() if n!=3}
assert not bad, ("not 3 matches:", bad)
for g in "ABCDEFGHIJKL": assert len(gcnt[g])==6, (g,len(gcnt[g]))
print("FIXTURES OK: 72 matches, 12 groups x 6, every team plays 3")

# ---- math (mirror the app) ----
R=6371
def rad(d): return d*math.pi/180
def hav(a,b):
    dLat=rad(b['lat']-a['lat']); dLon=rad(b['lon']-a['lon'])
    s=math.sin(dLat/2)**2+math.cos(rad(a['lat']))*math.cos(rad(b['lat']))*math.sin(dLon/2)**2
    return 2*R*math.asin(math.sqrt(s))
def effshift(fr,to):
    raw=to-fr; return ((raw+12)%24+24)%24-12

# per-team fixed data: base, home utc, sorted (day->slot), rest gaps, const(jet+cong)
def team_dates(t):
    ds=sorted(d for (d,g,h,a,c) in F if h==t or a==t)
    return ds
def team_matches(t):
    return [i for i,(d,g,h,a,c) in enumerate(F) if h==t or a==t]

wn=W  # already sums to 1
def jet_const(t):
    o=C[TEAMS[t]['o']]; b=C[BASES[t]]
    dz=effshift(o['utc'],b['utc']); adz=abs(dz)
    dirW=H['aE'] if dz>0 else H['aW']
    jet=0.0 if adz==0 else adz*dirW*max(0,1-LEAD/(H['kappa']*adz))
    return jet
def cong_const(t):
    ds=team_dates(t)
    return max(0,H['gMin']-(ds[1]-ds[0]))+max(0,H['gMin']-(ds[2]-ds[1]))
def rests(t):
    ds=team_dates(t); return [LEAD, ds[1]-ds[0], ds[2]-ds[1]]
def slot_of(t,mi):
    d=F[mi][0]; return sorted(team_dates(t)).index(d)

def travel_term(t,slot,ck):
    b=C[BASES[t]]; c=C[ck]; rest=rests(t)[slot]
    return 2*hav(b,c)*(1+H['delta']*math.exp(-rest/H['tau']))/1000.0
def heat_term(ck):
    return max(0, C[ck]['wb']-H['thetaHeat'])
def alt_term(t,ck):
    b=C[BASES[t]]; c=C[ck]
    return H['bExp']*max(0,(c['el']-H['h0'])/100.0)+H['bTrans']*abs(c['el']-b['el'])/100.0
def const_t(t):
    return 100*(wn['jet']/REF['jet']*jet_const(t)+wn['cong']/REF['cong']*cong_const(t))
def cost(t,mi,ck):
    s=slot_of(t,mi)
    return 100*(wn['travel']/REF['travel']*travel_term(t,s,ck)
               +wn['heat']/REF['heat']*heat_term(ck)
               +wn['alt']/REF['alt']*alt_term(t,ck))

def allowed(mi):
    d,g,h,a,c=F[mi]
    if "Mexico" in (h,a): return MX
    if "Canada" in (h,a): return CA
    if "United States" in (h,a): return US
    return HOSTS

def burden_under(assign):  # assign: dict mi->city
    out={}
    for t in TEAMS:
        b=const_t(t)
        for mi in team_matches(t): b+=cost(t,mi,assign[mi])
        out[t]=b
    return out

actual={i:F[i][4] for i in range(72)}
ba=burden_under(actual)
amax=max(ba.values()); amin=min(ba.values())
print(f"\nACTUAL (FIFA): max={amax:.2f}  min={amin:.2f}  gap={amax-amin:.2f}")
hardest=sorted(ba.items(),key=lambda kv:-kv[1])[:5]
print("  hardest:", [(t,round(v,1)) for t,v in hardest])

# ---- exact minimax MILP ----
prob=pulp.LpProblem("venue_minimax",pulp.LpMinimize)
x={}
for mi in range(72):
    for c in allowed(mi):
        x[(mi,c)]=pulp.LpVariable(f"x_{mi}_{c}",cat="Binary")
Z=pulp.LpVariable("Z",lowBound=0)
prob += Z
# assignment
for mi in range(72):
    prob += pulp.lpSum(x[(mi,c)] for c in allowed(mi))==1
# no double-booking: per (day,city) <=1
days=sorted(set(d for d,_,_,_,_ in F))
for d in days:
    for c in HOSTS:
        terms=[x[(mi,c)] for mi in range(72) if F[mi][0]==d and c in allowed(mi)]
        if terms: prob += pulp.lpSum(terms)<=1
# epigraph per team
for t in TEAMS:
    prob += Z >= const_t(t)+pulp.lpSum(cost(t,mi,c)*x[(mi,c)]
                                       for mi in team_matches(t) for c in allowed(mi))
prob.solve(pulp.PULP_CBC_CMD(msg=0))
print("\nMILP status:", pulp.LpStatus[prob.status])
opt={}
for mi in range(72):
    for c in allowed(mi):
        if x[(mi,c)].value()>0.5: opt[mi]=c
bo=burden_under(opt)
omax=max(bo.values()); omin=min(bo.values())
print(f"MILP-optimal: max={omax:.2f}  min={omin:.2f}  gap={omax-omin:.2f}")
print(f"  worst-team burden {amax:.2f} -> {omax:.2f}  ({100*(1-omax/amax):.1f}% lower)")
print(f"  fairness gap {amax-amin:.2f} -> {omax-omin:.2f}  ({100*(1-(omax-omin)/(amax-amin)):.1f}% tighter)")
moved=[(mi,F[mi][1],F[mi][2],F[mi][3],actual[mi],opt[mi]) for mi in range(72) if actual[mi]!=opt[mi]]
print(f"  matches relocated: {len(moved)} of 72")
for mi,g,h,a,c0,c1 in moved[:12]:
    print(f"    {h} v {a} ({g}): {C[c0]['n']} -> {C[c1]['n']}")

# ---- emit JS: FIXTURES + MILP optimal cities + reference numbers ----
fx_js="const FIXTURES=[\n"
for d,g,h,a,c in F:
    fx_js+=f'  [{d},"{g}","{h}","{a}","{c}"],\n'
fx_js+="];\n"
opt_js="const MILP_OPT=["+",".join(f'"{opt[i]}"' for i in range(72))+"];\n"
audit=dict(actualMax=round(amax,2),actualMin=round(amin,2),actualGap=round(amax-amin,2),
           optMax=round(omax,2),optMin=round(omin,2),optGap=round(omax-omin,2),
           moved=len(moved))
audit_js="const MILP_AUDIT="+json.dumps(audit)+";\n"
open(os.path.join(HERE, "fixtures.js"), "w").write(fx_js+opt_js+audit_js)
print("\nwrote fixtures.js (",len(fx_js)+len(opt_js)," chars )")
print("AUDIT:",audit)

# ---- test: does a fast greedy local search reach the MILP optimum? ----
def greedy():
    assign=dict(actual)
    occ={}
    for mi in range(72): occ[(F[mi][0],assign[mi])]=mi
    tb=burden_under(assign)
    def phi(tb): vs=tb.values(); return 1000*max(vs)+sum(vs)
    cur=phi(tb)
    def teams_of(mi): return [F[mi][2],F[mi][3]]
    for _ in range(60):
        best=None; bestd=-1e-6
        for mi in range(72):
            d=F[mi][0]; c0=assign[mi]
            for c1 in allowed(mi):
                if c1==c0: continue
                occu=occ.get((d,c1))
                # build trial assignment delta
                aff=set(teams_of(mi))
                if occu is not None:
                    if c0 not in allowed(occu): continue  # swap infeasible
                    aff|=set(teams_of(occu))
                trial=dict()
                trial[mi]=c1
                if occu is not None: trial[occu]=c0
                # recompute affected burdens
                newb={}
                for t in aff:
                    b=const_t(t)
                    for m2 in team_matches(t):
                        cc=trial.get(m2, assign[m2]); b+=cost(t,m2,cc)
                    newb[t]=b
                tb2=dict(tb); tb2.update(newb)
                p2=phi(tb2); dlt=p2-cur
                if dlt<bestd: bestd=dlt; best=(mi,c1,occu,dict(newb),p2)
        if best is None: break
        mi,c1,occu,newb,p2=best
        d=F[mi][0]; c0=assign[mi]
        del occ[(d,c0)]
        if occu is not None:
            assign[occu]=c0; occ[(d,c0)]=occu
        assign[mi]=c1; occ[(d,c1)]=mi
        tb.update(newb); cur=p2
    return assign
ga=greedy(); gb=burden_under(ga)
gmax=max(gb.values()); gmin=min(gb.values())
print(f"\nGREEDY (warm-start actual): max={gmax:.2f} gap={gmax-gmin:.2f}  (MILP max={omax:.2f})")
print(f"  greedy worst-team is {100*(gmax-omax)/omax:.2f}% above MILP optimum")

# ---- why does Gini rise under the MILP optimum? ----
def gini(xs):
    a=sorted(xs); n=len(a); s=sum(a)
    if s==0: return 0.0
    cum=sum((i+1)*v for i,v in enumerate(a))
    return (2*cum)/(n*s)-(n+1)/n
av=list(ba.values()); ov=list(bo.values())
import statistics as st
print("\n--- fairness metrics: actual vs MILP-optimal ---")
print(f"actual : max {max(av):.2f}  min {min(av):.2f}  range {max(av)-min(av):.2f}  mean {st.mean(av):.2f}  gini {gini(av):.3f}")
print(f"optimum: max {max(ov):.2f}  min {min(ov):.2f}  range {max(ov)-min(ov):.2f}  mean {st.mean(ov):.2f}  gini {gini(ov):.3f}")
print(f"teams at/near 0 burden — actual: {sum(1 for v in av if v<1)}, optimum: {sum(1 for v in ov if v<1)}")
