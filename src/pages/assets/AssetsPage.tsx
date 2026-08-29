import React, { useState } from 'react';
import { Asset, AssetCategory, AssetStatus } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Laptop, Plus, Search, Filter, ShieldCheck, CheckCircle2, 
  Clock, AlertCircle, Edit3, User, DollarSign, X
} from 'lucide-react';

export const AssetsPage: React.FC = () => {
  const { currentCompany, currentUser, settings } = useAuth();
  const currencySymbol = settings?.currencySymbol || '₹';
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const [isAssetModalOpen, setIsAssetModalOpen] = useState<boolean>(false);
  const [assetName, setAssetName] = useState<string>('');
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('LAPTOP');
  const [assetSerial, setAssetSerial] = useState<string>('');
  const [assetCost, setAssetCost] = useState<number>(75000);
  const [assetCondition, setAssetCondition] = useState<Asset['condition']>('NEW');
  const [assignedEmpId, setAssignedEmpId] = useState<string>('');

  const employees = storageService.getEmployees(currentCompany?.id);
  const assets = storageService.getAssets(currentCompany?.id);

  const filteredAssets = assets.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.serialNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || a.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const newAsset: Asset = {
      id: `ast-${Date.now()}`,
      companyId: currentCompany?.id || '',
      name: assetName,
      category: assetCategory,
      serialNumber: assetSerial || `SN-${Math.floor(10000 + Math.random() * 90000)}`,
      assignedToEmployeeId: assignedEmpId || undefined,
      assignedDate: assignedEmpId ? new Date().toISOString().split('T')[0] : undefined,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchaseCost: Number(assetCost),
      currency: settings?.currency || 'INR',
      status: assignedEmpId ? 'ASSIGNED' : 'AVAILABLE',
      condition: assetCondition,
    };

    storageService.saveAsset(newAsset);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'CREATE_ASSET',
      category: 'SETTINGS',
      details: `Added company equipment item: ${newAsset.name} (SN: ${newAsset.serialNumber})`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setIsAssetModalOpen(false);
    setAssetName('');
    setAssetSerial('');
  };

  const getStatusBadge = (status: AssetStatus) => {
    switch (status) {
      case 'ASSIGNED': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'MAINTENANCE': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'RETIRED': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default: return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  return (
    <div className="neo-page neo-assets">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Laptop className="w-6 h-6 text-brand-400" />
            <span>Asset & Hardware Inventory</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Track company equipment allocations, laptops, serial numbers, and physical hardware checkouts.
          </p>
        </div>

        <button
          onClick={() => setIsAssetModalOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Asset</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 text-xs">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search equipment by model name or serial number..."
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Categories</option>
            <option value="LAPTOP">Laptops & Workstations</option>
            <option value="MONITOR">Monitors & Displays</option>
            <option value="ACCESS_CARD">Access Cards & Keys</option>
            <option value="PHONE">Mobile Phones</option>
            <option value="OTHER">Other Equipment</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Asset Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Serial Number</th>
                <th className="py-3 px-4">Assigned To</th>
                <th className="py-3 px-4">Purchase Cost</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredAssets.map((asset) => {
                const emp = employees.find(e => e.id === asset.assignedToEmployeeId);

                return (
                  <tr key={asset.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">{asset.name}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {asset.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-brand-300 font-semibold">{asset.serialNumber}</td>
                    <td className="py-3 px-4">
                      {emp ? (
                        <div className="flex items-center space-x-2">
                          <img
                            src={emp.avatarUrl}
                            alt={emp.firstName}
                            className="w-6 h-6 rounded-lg object-cover border border-slate-700"
                          />
                          <span className="text-white font-medium">{emp.firstName} {emp.lastName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">In Storage / Available</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 font-semibold">{currencySymbol}{asset.purchaseCost.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                        {asset.condition}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadge(asset.status)}`}>
                        {asset.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Asset Modal */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsAssetModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Add Hardware / Asset</h3>
            <p className="text-xs text-slate-400 mt-0.5">Register new company equipment to inventory.</p>

            <form onSubmit={handleSaveAsset} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Asset / Model Name *</label>
                <input
                  type="text"
                  required
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="e.g. MacBook Pro 16 M3 Max"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="LAPTOP">Laptop / PC</option>
                    <option value="MONITOR">Monitor / Display</option>
                    <option value="ACCESS_CARD">Access Card</option>
                    <option value="PHONE">Mobile Device</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={assetSerial}
                    onChange={(e) => setAssetSerial(e.target.value)}
                    placeholder="MBP-98214"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Purchase Cost ({currencySymbol})</label>
                  <input
                    type="number"
                    value={assetCost}
                    onChange={(e) => setAssetCost(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Assign to Employee</label>
                  <select
                    value={assignedEmpId}
                    onChange={(e) => setAssignedEmpId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Keep in Storage (Available)</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
