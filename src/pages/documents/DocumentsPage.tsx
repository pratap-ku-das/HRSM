import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, File, FileText, RefreshCw, Upload, X } from 'lucide-react';
import { api } from '../../services/api';
import type { CompanyDocument } from '../../types';
import { useToast } from '../../context/ToastContext';

const documentKeys = [
  ['INCORPORATION_CERTIFICATE', 'Certificate of incorporation'],
  ['GST_CERTIFICATE', 'GST registration certificate'],
  ['PAN_CARD', 'Company PAN card'],
  ['TAN_CERTIFICATE', 'TAN certificate'],
  ['UDYAM_CERTIFICATE', 'Udyam / MSME certificate'],
  ['EPFO_CERTIFICATE', 'EPFO registration'],
  ['ESIC_CERTIFICATE', 'ESIC registration'],
  ['PROFESSIONAL_TAX', 'Professional tax registration'],
  ['LABOUR_LICENCE', 'Labour licence'],
  ['TRADE_LICENCE', 'Trade licence'],
  ['BANK_PROOF', 'Bank account proof'],
  ['POLICY', 'Company policy'],
  ['HANDBOOK', 'Employee handbook'],
  ['TEMPLATE', 'Company template'],
  ['OTHER', 'Other company document'],
] as const;

type Preview = { url: string; title: string; fileName: string; mimeType: string };

export const DocumentsPage: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<CompanyDocument[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [openingId, setOpeningId] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.getOperationsWorkspace();
      setItems(data.documents);
      setCanManage(data.canManage);
    } catch (error) {
      toast.error('Documents could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const openDocument = async (item: CompanyDocument) => {
    if (!item.objectKey) {
      window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setOpeningId(item.id);
    try {
      const result = await api.getCompanyDocumentFile(item.id);
      closePreview();
      setPreview({
        url: URL.createObjectURL(result.blob),
        title: item.title,
        fileName: result.fileName || item.fileName || item.title,
        mimeType: result.mimeType || item.mimeType || item.fileType,
      });
    } catch (error) {
      toast.error('Document could not be opened', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setOpeningId('');
    }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!category || !file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Document is too large', 'Choose a file smaller than 20 MB.');
      return;
    }
    setBusy(true);
    try {
      await api.uploadCompanyDocumentV1(file, category, title.trim());
      setCategory('');
      setTitle('');
      setFile(null);
      await load();
      toast.success('Company document uploaded');
    } catch (error) {
      toast.error('Document upload failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="neo-page neo-documents space-y-5">
      <header className="flex justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="flex gap-2 text-2xl font-bold">
            <FileText className="text-brand-400" />
            Company Documents
          </h1>
          <p className="text-xs text-slate-400">
            Secure registration certificates, statutory records, policies and company files.
          </p>
        </div>
        <button type="button" onClick={() => void load()} aria-label="Refresh company documents">
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {canManage && (
        <form onSubmit={upload} className="company-document-upload rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <h2 className="font-bold">Upload company document</h2>
            <p className="mt-1 text-xs text-slate-400">
              Select the document key first, then choose the actual file.
            </p>
          </div>
          <label className="space-y-1 text-xs">
            <span className="font-semibold text-slate-600">Document key / type *</span>
            <select
              required
              value={category}
              onChange={(event) => {
                const value = event.target.value;
                setCategory(value);
                setTitle(documentKeys.find(([key]) => key === value)?.[1] || '');
                setFile(null);
              }}
              className="input w-full"
            >
              <option value="">Select document key</option>
              {documentKeys.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-semibold text-slate-600">Document title *</span>
            <input required value={title} onChange={(event) => setTitle(event.target.value)} className="input w-full" />
          </label>
          <label className={`company-document-picker ${!category ? 'is-disabled' : ''}`}>
            <Upload className="h-5 w-5" />
            <span className="min-w-0">
              <strong>{file ? file.name : 'Choose document file'}</strong>
              <small>PDF, JPG, PNG, DOC or DOCX up to 20 MB</small>
            </span>
            <input
              type="file"
              required
              disabled={!category}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="sr-only"
            />
          </label>
          <button type="submit" disabled={busy || !category || !title.trim() || !file} className="rounded-xl bg-brand-500 px-5 py-3 text-white">
            {busy ? 'Uploading...' : 'Upload document'}
          </button>
        </form>
      )}

      <section className="company-document-grid">
        {items.map((item) => (
          <article key={item.id} className="company-document-card">
            <span className="company-document-card-icon"><FileText className="h-7 w-7" /></span>
            <div className="min-w-0">
              <strong className="block truncate">{item.title}</strong>
              <p className="mt-1 text-xs text-slate-500">
                {documentKeys.find(([key]) => key === item.category)?.[1] || item.category}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-400">
                {item.fileName || item.fileType} {item.sizeBytes ? `� ${Math.ceil(item.sizeBytes / 1024)} KB` : ''}
              </p>
            </div>
            <button type="button" onClick={() => void openDocument(item)} disabled={openingId === item.id} className="company-document-open">
              <Eye className="h-4 w-4" />
              {openingId === item.id ? 'Opening...' : 'Preview'}
            </button>
          </article>
        ))}
        {!busy && items.length === 0 && <div className="company-documents-empty">No company documents have been uploaded yet.</div>}
      </section>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" className="absolute inset-0" onClick={closePreview} aria-label="Close document preview" />
          <section className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="flex items-center justify-between gap-4 border-b border-slate-700 p-4">
              <div className="min-w-0"><h2 className="truncate font-bold">{preview.title}</h2><p className="truncate text-xs text-slate-400">{preview.fileName}</p></div>
              <div className="flex gap-2">
                <a href={preview.url} download={preview.fileName} className="flex items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white"><Download className="h-4 w-4" />Download</a>
                <button type="button" onClick={closePreview} className="rounded-xl border border-slate-700 p-2" aria-label="Close preview"><X className="h-4 w-4" /></button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-3">
              {preview.mimeType.startsWith('image/') ? <img src={preview.url} alt={preview.title} className="max-h-full max-w-full object-contain" /> : preview.mimeType === 'application/pdf' ? <iframe src={preview.url} title={preview.title} className="h-full w-full rounded-lg bg-white" /> : <div className="text-center"><File className="mx-auto h-16 w-16 text-brand-400" /><h3 className="mt-4 font-bold">Preview is not available</h3><p className="mt-2 text-sm text-slate-400">Download this Office document to open it.</p></div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
