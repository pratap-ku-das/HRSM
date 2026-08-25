import React, { useState } from 'react';
import { CompanyDocument } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  FileText, Plus, Download, ShieldCheck, File, 
  Folder, Calendar, CheckCircle2, X
} from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const { currentCompany } = useAuth();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [docTitle, setDocTitle] = useState<string>('');
  const [docCat, setDocCat] = useState<CompanyDocument['category']>('POLICY');

  const documents = storageService.getDocuments(currentCompany?.id);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const newDoc: CompanyDocument = {
      id: `doc-${Date.now()}`,
      companyId: currentCompany?.id || '',
      title: docTitle,
      category: docCat,
      fileSize: '2.4 MB',
      fileType: 'PDF',
      downloadUrl: '#',
      uploadedAt: new Date().toISOString(),
    };

    storageService.saveDocument(newDoc);
    setIsUploadModalOpen(false);
    setDocTitle('');
  };

  return (
    <div className="neo-page neo-documents">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <FileText className="w-6 h-6 text-brand-400" />
            <span>Company Documents & Policy Vault</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Central repository for employee handbooks, compliance agreements, benefits guides, and NDA templates.
          </p>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Grid of Documents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                  <File className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                  {doc.category}
                </span>
              </div>

              <h3 className="text-sm font-bold text-white mt-3">{doc.title}</h3>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-2">
                <span>{doc.fileType} Format</span>
                <span>•</span>
                <span>{doc.fileSize}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(doc.uploadedAt).toLocaleDateString()}
              </span>
              <a
                href={doc.downloadUrl}
                onClick={(e) => {
                  e.preventDefault();
                  alert(`Downloading: ${doc.title}`);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-brand-300 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsUploadModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Upload Policy or Document</h3>

            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Document Title *</label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Remote Work Security Guidelines 2026"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Category</label>
                <select
                  value={docCat}
                  onChange={(e) => setDocCat(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="POLICY">Company Policy</option>
                  <option value="HANDBOOK">Employee Handbook</option>
                  <option value="BENEFITS">Benefits & Insurance</option>
                  <option value="COMPLIANCE">SOC-2 / Compliance</option>
                  <option value="TEMPLATE">Standard Form Template</option>
                </select>
              </div>

              <div className="p-6 border-2 border-dashed border-slate-700 rounded-2xl text-center space-y-1 text-slate-400">
                <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                <div className="text-white font-medium">Click to select PDF or drag & drop</div>
                <div className="text-[10px]">Maximum file size: 25MB</div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Publish Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
