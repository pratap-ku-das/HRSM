import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Eye,
  File,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import type { Employee } from '../../types';
import { useToast } from '../../context/ToastContext';

type EmployeeDocument = {
  id: string;
  employeeId: string;
  documentType: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  issueDate?: string;
  expiryDate?: string;
  verificationStatus: string;
  createdAt: string;
};

type Preview = {
  url: string;
  title: string;
  fileName: string;
  mimeType: string;
};

const documentLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const EmployeeDocumentsPage: React.FC = () => {
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [employeeData, documentData] = await Promise.all([
        api.getEmployeesV1(),
        api.getEmployeeDocumentsV1(),
      ]);
      setEmployees(employeeData);
      setDocuments(documentData as EmployeeDocument[]);
    } catch (error) {
      toast.error(
        'Employee documents could not be loaded',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const documentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((document) =>
      counts.set(document.employeeId, (counts.get(document.employeeId) || 0) + 1),
    );
    return counts;
  }, [documents]);

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees
      .filter((employee) =>
        !query
          ? true
          : `${employee.firstName} ${employee.lastName} ${employee.employeeCode}`
              .toLowerCase()
              .includes(query),
      )
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ),
      );
  }, [employees, search]);

  const selectedEmployee = employees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const selectedDocuments = documents.filter(
    (document) => document.employeeId === selectedEmployeeId,
  );

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const openPreview = async (document: EmployeeDocument) => {
    setOpeningId(document.id);
    try {
      const file = await api.getEmployeeDocumentFile(document.id);
      closePreview();
      setPreview({
        url: URL.createObjectURL(file.blob),
        title: document.title,
        fileName: file.fileName || document.fileName,
        mimeType: file.mimeType || document.mimeType,
      });
    } catch (error) {
      toast.error(
        'Document could not be opened',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setOpeningId('');
    }
  };

  return (
    <div className="neo-page neo-employee-documents space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FolderOpen className="text-brand-400" />
            Employee Documents
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Secure employee folders with document preview and download.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded-xl border border-slate-700 p-2"
          aria-label="Refresh employee documents"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {!selectedEmployee ? (
        <section className="employee-documents-browser rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="employee-documents-toolbar">
            <label className="employee-document-search">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee name or employee ID"
              />
            </label>
            <div className="employee-documents-summary">
              <strong>{visibleEmployees.length}</strong>
              <span>employee folders</span>
              <i />
              <strong>{documents.length}</strong>
              <span>documents</span>
            </div>
          </div>
          <div className="employee-document-folders">
            {visibleEmployees.map((employee) => {
              const count = documentCounts.get(employee.id) || 0;
              return (
                <button
                  type="button"
                  key={employee.id}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  className="employee-document-folder group"
                >
                  <span className="employee-document-folder-icon">
                    <Folder className="h-9 w-9" />
                  </span>
                  <span className="employee-document-folder-copy">
                    <strong>
                      {employee.firstName} {employee.lastName}
                    </strong>
                    <span className="employee-document-code">
                      Employee ID: {employee.employeeCode}
                    </span>
                    <span className="employee-document-count">
                      {count} {count === 1 ? 'document' : 'documents'}
                    </span>
                  </span>
                  <span className="employee-document-open">
                    Open folder
                  </span>
                </button>
              );
            })}
            {!busy && visibleEmployees.length === 0 && (
              <div className="employee-documents-empty">
                No employee folders found.
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedEmployeeId('')}
            className="flex items-center gap-2 text-sm text-brand-300"
          >
            <ArrowLeft className="h-4 w-4" />
            All employee folders
          </button>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <FolderOpen className="h-10 w-10 text-amber-300" />
            <div>
              <h2 className="text-lg font-bold">
                {selectedEmployee.firstName} {selectedEmployee.lastName}
              </h2>
              <p className="text-xs text-slate-400">
                {selectedEmployee.employeeCode} {'\u00b7'} {selectedDocuments.length}{' '}
                documents
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {selectedDocuments.map((document) => (
              <button
                type="button"
                key={document.id}
                onClick={() => void openPreview(document)}
                disabled={openingId === document.id}
                className="flex w-full items-center justify-between gap-4 border-b border-slate-800 p-4 text-left transition last:border-0 hover:bg-slate-800"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <FileText className="h-6 w-6 shrink-0 text-brand-400" />
                  <span className="min-w-0">
                    <strong className="block truncate">{document.title}</strong>
                    <span className="block truncate text-xs text-slate-400">
                      {documentLabel(document.documentType)} {'\u00b7'} {document.fileName}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-brand-300">
                  <Eye className="h-4 w-4" />
                  {openingId === document.id ? 'Opening...' : 'Preview'}
                </span>
              </button>
            ))}
            {selectedDocuments.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                This employee folder has no documents yet.
              </div>
            )}
          </div>
        </section>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={closePreview}
            aria-label="Close document preview"
          />
          <section className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="flex items-center justify-between gap-4 border-b border-slate-700 p-4">
              <div className="min-w-0">
                <h2 className="truncate font-bold">{preview.title}</h2>
                <p className="truncate text-xs text-slate-400">
                  {preview.fileName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={preview.url}
                  download={preview.fileName}
                  className="flex items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-xl border border-slate-700 p-2"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-3">
              {preview.mimeType.startsWith('image/') ? (
                <img
                  src={preview.url}
                  alt={preview.title}
                  className="max-h-full max-w-full object-contain"
                />
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe
                  src={preview.url}
                  title={preview.title}
                  className="h-full w-full rounded-lg bg-white"
                />
              ) : (
                <div className="max-w-md text-center">
                  <File className="mx-auto h-16 w-16 text-brand-400" />
                  <h3 className="mt-4 font-bold">Preview is not available</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    This Office document must be downloaded and opened with a
                    compatible application.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
