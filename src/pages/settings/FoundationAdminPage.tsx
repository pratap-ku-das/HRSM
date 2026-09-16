import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { AccessConfiguration, OrganizationStructure, PermissionScope } from '../../types';
import { useToast } from '../../context/ToastContext';

const starterPermissions = ['employee.read.all', 'employee.read.team', 'employee.read.self', 'employee.manage', 'attendance.read.team', 'attendance.manage', 'leave.review', 'expense.review', 'payroll.manage', 'payroll.approve', 'organization.read'];
type OrgKind = 'branches' | 'locations' | 'teams' | 'cost-centers' | 'grades';

export const FoundationAdminPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<'organization' | 'access'>('organization');
  const [organization, setOrganization] = useState<OrganizationStructure | null>(null);
  const [access, setAccess] = useState<AccessConfiguration | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<OrgKind>('branches');
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [parentId, setParentId] = useState('');
  const [roleName, setRoleName] = useState(''); const [roleCode, setRoleCode] = useState(''); const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [userId, setUserId] = useState(''); const [roleId, setRoleId] = useState(''); const [scope, setScope] = useState<PermissionScope>('ALL_COMPANY'); const [scopeEntityId, setScopeEntityId] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try { const [org, rights] = await Promise.all([api.getOrganization(), api.getAccessConfiguration()]); setOrganization(org); setAccess(rights); }
    catch (error) { toast.error('Foundation data could not be loaded', error instanceof Error ? error.message : 'Unknown error'); }
    finally { setBusy(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const collections = useMemo(() => organization ? {
    branches: organization.branches, locations: organization.locations, teams: organization.teams,
    'cost-centers': organization.costCenters, grades: organization.grades,
  } : null, [organization]);
  const targets = scope === 'BRANCH' ? organization?.branches : scope === 'DEPARTMENT' ? organization?.departments : scope === 'TEAM' ? organization?.teams : [];

  const createOrg = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const body: Record<string, unknown> = { name, code };
      if (kind === 'locations') { body.country = 'IN'; if (parentId) body.branchId = parentId; }
      if (kind === 'teams' && parentId) body.departmentId = parentId;
      if (kind === 'grades') body.rank = (organization?.grades.length || 0) + 1;
      await api.createOrganizationItem(kind, body); setName(''); setCode(''); setParentId(''); toast.success('Organization item created'); await load();
    } catch (error) { toast.error('Could not create item', error instanceof Error ? error.message : 'Unknown error'); } finally { setBusy(false); }
  };
  const seedPermissions = async () => { setBusy(true); try { await Promise.all(starterPermissions.map(key => api.createPermission(key))); toast.success('Starter permissions configured'); await load(); } catch (error) { toast.error('Permission setup failed', error instanceof Error ? error.message : 'Unknown error'); } finally { setBusy(false); } };
  const createRole = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await api.createAccessRole({ name: roleName, code: roleCode, permissionIds }); setRoleName(''); setRoleCode(''); setPermissionIds([]); toast.success('Access role created'); await load(); } catch (error) { toast.error('Role creation failed', error instanceof Error ? error.message : 'Unknown error'); } finally { setBusy(false); } };
  const createGrant = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await api.createAccessGrant({ userId, roleId, scope, scopeEntityId: ['ALL_COMPANY', 'SELF'].includes(scope) ? undefined : scopeEntityId }); toast.success('Scoped access granted'); await load(); } catch (error) { toast.error('Grant failed', error instanceof Error ? error.message : 'Unknown error'); } finally { setBusy(false); } };

  return <div className="neo-page space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4"><div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck className="text-brand-400"/>Organization & Access</h1><p className="text-xs text-slate-400 mt-1">Tenant hierarchy, custom roles, least-privilege scopes, and auditable grants.</p></div><button onClick={() => void load()} disabled={busy} className="p-2 rounded-xl border border-slate-700"><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`}/></button></div>
    <div className="flex gap-2">{(['organization','access'] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === value ? 'bg-brand-500 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>{value === 'organization' ? 'Organization' : 'Roles & Access'}</button>)}</div>
    {tab === 'organization' && <div className="grid xl:grid-cols-[340px_1fr] gap-5">
      <form onSubmit={createOrg} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"><h2 className="font-bold flex items-center gap-2"><Plus className="w-4 h-4"/>Add structure item</h2><select value={kind} onChange={e => { setKind(e.target.value as OrgKind); setParentId(''); }} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5">{(['branches','locations','teams','cost-centers','grades'] as OrgKind[]).map(x => <option key={x} value={x}>{x}</option>)}</select><input required value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"/><input required value={code} onChange={e => setCode(e.target.value)} placeholder="Code" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"/>{kind === 'locations' && <select value={parentId} onChange={e => setParentId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"><option value="">No branch</option>{organization?.branches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}{kind === 'teams' && <select value={parentId} onChange={e => setParentId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"><option value="">No department</option>{organization?.departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}<button disabled={busy} className="w-full bg-brand-500 rounded-xl p-2.5 font-bold">Create</button></form>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{collections && Object.entries(collections).map(([label, items]) => <section key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><h3 className="font-bold capitalize flex items-center gap-2"><Building2 className="w-4 h-4 text-brand-400"/>{label} <span className="text-slate-500">({items.length})</span></h3><div className="mt-3 space-y-2">{items.map(item => <div key={item.id} className="bg-slate-950 rounded-xl p-3"><div className="text-sm font-semibold">{item.name}</div><div className="text-[10px] text-slate-500 font-mono">{item.code}</div></div>)}{!items.length && <p className="text-xs text-slate-500">None configured.</p>}</div></section>)}</div>
    </div>}
    {tab === 'access' && <div className="space-y-5">
      <div className="flex justify-between items-center"><p className="text-xs text-slate-400">Permissions are reusable capabilities. Roles bundle them; grants apply a company, branch, department, team, or self scope.</p><button onClick={() => void seedPermissions()} disabled={busy} className="px-3 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 text-xs font-bold">Configure starter permissions</button></div>
      <div className="grid lg:grid-cols-2 gap-5"><form onSubmit={createRole} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"><h2 className="font-bold flex items-center gap-2"><KeyRound className="w-4 h-4"/>Create custom role</h2><input required value={roleName} onChange={e=>setRoleName(e.target.value)} placeholder="Role name" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"/><input required value={roleCode} onChange={e=>setRoleCode(e.target.value)} placeholder="Role code" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"/><div className="max-h-44 overflow-auto space-y-1">{access?.permissions.map(p => <label key={p.id} className="flex gap-2 text-xs p-2 bg-slate-950 rounded-lg"><input type="checkbox" checked={permissionIds.includes(p.id)} onChange={()=>setPermissionIds(old=>old.includes(p.id)?old.filter(x=>x!==p.id):[...old,p.id])}/>{p.key}</label>)}</div><button disabled={busy} className="w-full bg-brand-500 rounded-xl p-2.5 font-bold">Create role</button></form>
      <form onSubmit={createGrant} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"><h2 className="font-bold">Grant scoped role</h2><select required value={userId} onChange={e=>setUserId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"><option value="">Choose user</option>{access?.users.map(u=><option key={u.id} value={u.id}>{u.fullName} — {u.email}</option>)}</select><select required value={roleId} onChange={e=>setRoleId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"><option value="">Choose role</option>{access?.roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><select value={scope} onChange={e=>{setScope(e.target.value as PermissionScope);setScopeEntityId('')}} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5">{(['ALL_COMPANY','BRANCH','DEPARTMENT','TEAM','SELF'] as PermissionScope[]).map(x=><option key={x}>{x}</option>)}</select>{!['ALL_COMPANY','SELF'].includes(scope)&&<select required value={scopeEntityId} onChange={e=>setScopeEntityId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5"><option value="">Choose scope target</option>{targets?.map(x=><option key={x.id} value={x.id}>{'name' in x ? x.name : ''}</option>)}</select>}<button disabled={busy} className="w-full bg-brand-500 rounded-xl p-2.5 font-bold">Grant access</button></form></div>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h2 className="font-bold mb-3">Active grants</h2><div className="space-y-2">{access?.grants.map(g=><div key={g.id} className="flex items-center justify-between bg-slate-950 rounded-xl p-3"><div><div className="text-sm font-semibold">{g.user.fullName} · {g.role.name}</div><div className="text-[11px] text-slate-500">{g.scope}{g.scopeEntityId ? ` · ${g.scopeEntityId}` : ''}</div></div><button aria-label="Revoke grant" onClick={async()=>{await api.revokeAccessGrant(g.id);toast.success('Grant revoked');await load()}} className="text-rose-400 p-2"><Trash2 className="w-4 h-4"/></button></div>)}</div></section>
    </div>}
  </div>;
};
