# Fails if an animation worklet (useDerivedValue, useFrameCallback, Skia buffer hooks) calls a helper that is not marked "worklet".
# On Android such a call aborts the app with no JS error. Run: python3 scripts/check-worklets.py
import sys
import re,glob,os
files=glob.glob('src/visuals/**/*.ts',recursive=True)+glob.glob('src/visuals/**/*.tsx',recursive=True)
src={f:open(f).read() for f in files}
defs={}  # file -> {name: isWorklet}
pat=re.compile(r'^\s*(?:export )?(?:function (\w+)\s*\(|(?:const|let) (\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]*)?=>)',re.M)
for f,s in src.items():
    d={}
    for m in pat.finditer(s):
        n=m.group(1) or m.group(2)
        # find body start
        j=s.find('{',m.end()) if m.group(1) else s.find('=>',m.end())+2
        body=s[j:j+80]
        d[n]=bool(re.match(r'\s*\{?\s*["\']worklet["\']',body))
    defs[f]=d
def resolve(f,spec):
    base=os.path.normpath(os.path.join(os.path.dirname(f),spec))
    for c in [base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx']:
        if c in defs: return c
FOUND=[]
hooks=['useDerivedValue','useFrameCallback','useAnimatedStyle','useAnimatedReaction','useRSXformBuffer','useColorBuffer','useRectBuffer','usePointBuffer']
for f,s in src.items():
    table=dict(defs[f])
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*"(\.[^"]+)"',s):
        tf=resolve(f,m.group(2))
        if not tf: continue
        for n in [x.strip().split(' as ')[-1] for x in m.group(1).split(',') if x.strip()]:
            orig=[x.strip().split(' as ')[0] for x in m.group(1).split(',') if x.strip().endswith(n)][0]
            if orig in defs[tf]: table[n]=defs[tf][orig]
    for h in hooks:
        for m in re.finditer(h+r'\s*\(',s):
            i=m.end(); d=1
            while d and i<len(s): d+=s[i]=='('; d-=s[i]==')'; i+=1
            blk=s[m.start():i]
            called=set(re.findall(r'(?<![\.\w])([A-Za-z_]\w*)\s*\(',blk))
            bad=sorted(x for x in called if x in table and not table[x] and x not in (h,))
            if bad: print(f"{f}:{s[:m.start()].count(chr(10))+1} {h}: {bad}"); FOUND.append(1)
print('worklet check:', 'FAILED' if FOUND else 'ok'); sys.exit(1 if FOUND else 0)
