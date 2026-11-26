import {
  CheckSquare,
  FileSpreadsheet,
  Layers,
  Printer,
  Search,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GridDaySchedule, RoomGroupId } from '../data/roomGroups';
import {
  formatWebUntisDayHeader,
  normalizeSearchText,
} from '../utils/dateUtils';

export type PrintJobConfig =
  | {
      mode: 'grids';
      gridIds: RoomGroupId[];
      pageBreak: boolean;
    }
  | {
      mode: 'custom-summary';
      roomNames: string[];
      includeDetails: boolean;
    };

interface PrintCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  grids: GridDaySchedule[];
  dateIso: string;
  initialTab: 'grids' | 'summary';
  onExecutePrint: (config: PrintJobConfig) => void;
}

export function PrintCenterModal({
  isOpen,
  onClose,
  grids,
  dateIso,
  initialTab,
  onExecutePrint,
}: PrintCenterModalProps) {
  const [activeTab, setActiveTab] = useState<'grids' | 'summary'>(initialTab);
  const [selectedGrids, setSelectedGrids] = useState<RoomGroupId[]>(() =>
    grids.map((g) => g.id)
  );
  const [pageBreak, setPageBreak] = useState(true);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const g of grids) {
      for (const r of g.rooms) {
        if (r.occupiedSlotsCount > 0) initial.add(r.name);
      }
    }
    return initial;
  });
  const [roomSearch, setRoomSearch] = useState('');
  const [includeDetails, setIncludeDetails] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const allUniqueRoomNames = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const g of grids) {
      for (const r of g.rooms) {
        if (!seen.has(r.name)) {
          seen.add(r.name);
          list.push(r.name);
        }
      }
    }
    return list;
  }, [grids]);

  const normalizedRoomSearch = useMemo(
    () => normalizeSearchText(roomSearch),
    [roomSearch]
  );

  const filteredModalGrids = useMemo(() => {
    if (!normalizedRoomSearch) return grids;
    return grids
      .map((g) => ({
        ...g,
        rooms: g.rooms.filter(
          (r) =>
            normalizeSearchText(r.name).includes(normalizedRoomSearch) ||
            normalizeSearchText(r.longName).includes(normalizedRoomSearch) ||
            normalizeSearchText(g.title).includes(normalizedRoomSearch)
        ),
      }))
      .filter((g) => g.rooms.length > 0);
  }, [grids, normalizedRoomSearch]);

  if (!isOpen) return null;

  const toggleGrid = (id: RoomGroupId) => {
    setSelectedGrids((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleRoom = (name: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleWholeGridRooms = (grid: GridDaySchedule) => {
    const names = grid.rooms.map((r) => r.name);
    const allSelected = names.every((n) => selectedRooms.has(n));
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const n of names) next.delete(n);
      } else {
        for (const n of names) next.add(n);
      }
      return next;
    });
  };

  const selectOccupiedRoomsOnly = () => {
    const next = new Set<string>();
    for (const g of grids) {
      for (const r of g.rooms) {
        if (r.occupiedSlotsCount > 0) next.add(r.name);
      }
    }
    setSelectedRooms(next);
  };

  const handlePrintGrids = () => {
    if (selectedGrids.length === 0) return;
    const orderedIds = grids
      .map((g) => g.id)
      .filter((id) => selectedGrids.includes(id));
    onExecutePrint({
      mode: 'grids',
      gridIds: orderedIds,
      pageBreak,
    });
  };

  const handlePrintSummary = () => {
    if (selectedRooms.size === 0) return;
    const orderedNames = allUniqueRoomNames.filter((n) => selectedRooms.has(n));
    onExecutePrint({
      mode: 'custom-summary',
      roomNames: orderedNames,
      includeDetails,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-center-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2
              id="print-center-title"
              className="text-base font-bold text-slate-900 tracking-tight"
            >
              Centro de impresión · {formatWebUntisDayHeader(dateIso)}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Imprime varios bloques a la vez o genera un sumario personalizado
              eligiendo las aulas exactas en formato A4 horizontal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar centro de impresión"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100 bg-slate-50/70">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('grids')}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'grids'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Imprimir varios bloques</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'summary'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Sumario de aulas a medida</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'grids' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  Selecciona los bloques que quieres incluir en el PDF o
                  impresión:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedGrids(grids.map((g) => g.id))}
                    className="font-medium text-slate-700 hover:text-slate-950 underline-offset-2 hover:underline cursor-pointer"
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedGrids([])}
                    className="font-medium text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline cursor-pointer"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {grids.map((g) => {
                  const checked = selectedGrids.includes(g.id);
                  const pct =
                    g.totalSlots > 0
                      ? Math.round((g.occupiedSlots / g.totalSlots) * 100)
                      : 0;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGrid(g.id)}
                      className={`w-full px-4 py-3 rounded-xl border text-left flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                        checked
                          ? 'bg-red-50/40 border-red-300 text-slate-900'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-red-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            {g.title}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {g.subtitle} · {g.rooms.length}{' '}
                            {g.isSpecial ? 'espacios' : 'aulas'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="h-full bg-red-600 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono tabular-nums text-slate-600 w-10 text-right">
                          {pct}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 cursor-pointer">
                <div>
                  <span className="text-xs font-medium text-slate-800 block">
                    Un bloque por página A4 horizontal
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Desactívalo si prefieres agrupar bloques en la misma hoja.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={pageBreak}
                  onChange={(e) => setPageBreak(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Classroom Summary Selection Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    placeholder="Filtrar aula por código o bloque..."
                    aria-label="Filtrar aula para sumario"
                    className="w-full pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                  />
                  {roomSearch && (
                    <button
                      type="button"
                      onClick={() => setRoomSearch('')}
                      aria-label="Borrar filtro de aulas"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedRooms(new Set(allUniqueRoomNames))}
                    className="px-2.5 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={selectOccupiedRoomsOnly}
                    className="px-2.5 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Solo ocupadas
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRooms(new Set())}
                    className="px-2.5 py-1.5 font-medium text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Grouped Classroom Checklist */}
              <div className="space-y-4">
                {filteredModalGrids.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No se encontraron aulas con ese criterio de búsqueda.
                  </p>
                ) : (
                  filteredModalGrids.map((g) => {
                    const names = g.rooms.map((r) => r.name);
                    const selectedInGrid = names.filter((n) =>
                      selectedRooms.has(n)
                    ).length;
                    const allInGridSelected =
                      names.length > 0 && selectedInGrid === names.length;

                    return (
                      <div
                        key={g.id}
                        className="border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-800 tabular-nums">
                            {g.title}{' '}
                            <span className="font-mono font-normal text-slate-500">
                              ({selectedInGrid}/{names.length})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleWholeGridRooms(g)}
                            className="text-[11px] font-medium text-red-700 hover:text-red-800 cursor-pointer whitespace-nowrap"
                          >
                            {allInGridSelected
                              ? 'Quitar bloque'
                              : 'Marcar bloque'}
                          </button>
                        </div>
                        <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                          {g.rooms.map((room) => {
                            const checked = selectedRooms.has(room.name);
                            return (
                              <button
                                key={`${g.id}-${room.name}`}
                                type="button"
                                onClick={() => toggleRoom(room.name)}
                                title={`${room.name} · ${room.occupiedSlotsCount} franjas ocupadas`}
                                className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                                  checked
                                    ? 'bg-red-50/60 border-red-300 text-slate-900'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  {checked ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                  )}
                                  <span className="font-mono text-[11px] truncate">
                                    {room.name}
                                  </span>
                                </span>
                                {room.occupiedSlotsCount > 0 && (
                                  <span className="font-mono tabular-nums text-[10px] text-red-700 shrink-0">
                                    {room.occupiedSlotsCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <label className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 cursor-pointer">
                <div>
                  <span className="text-xs font-medium text-slate-800 block">
                    Incluir tabla resumen con asignaturas, horarios y profesorado
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Añade debajo de la cuadrícula un listado limpio con cada
                    clase o reserva de las aulas elegidas.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 tabular-nums">
            {activeTab === 'grids' ? (
              <span>
                {selectedGrids.length}{' '}
                {selectedGrids.length === 1
                  ? 'bloque seleccionado'
                  : 'bloques seleccionados'}
              </span>
            ) : (
              <span>
                {selectedRooms.size}{' '}
                {selectedRooms.size === 1
                  ? 'aula seleccionada'
                  : 'aulas seleccionadas'}{' '}
                de {allUniqueRoomNames.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            {activeTab === 'grids' ? (
              <button
                type="button"
                onClick={handlePrintGrids}
                disabled={selectedGrids.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  Imprimir{' '}
                  {selectedGrids.length === 1
                    ? '1 bloque'
                    : `${selectedGrids.length} bloques`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrintSummary}
                disabled={selectedRooms.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir sumario ({selectedRooms.size})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
