import React, { useState, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * BulkScreening - Componente para screening masivo por CSV
 * Versión 4.0: Usa backend report_generator.py para generación de reportes
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Configuración de paginación
const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

// Plantilla CSV para descargar
const CSV_TEMPLATE = `nombre,cedula,pais,fecha_nacimiento,nacionalidad
Juan Pérez García,8-888-8888,PA,1985-03-15,PA
María López Rodríguez,9-999-9999,PA,1990-07-22,CO
Carlos Hernández,,CO,,VE`;

/**
 * Generate HTML report using backend API (report_generator.py)
 * This ensures consistent report generation across all channels
 */
async function generateReportHTML(result) {
  try {
    const response = await fetch(`${API_URL}/api/v1/reports/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        screening_data: result
      }),
    });

    if (!response.ok) {
      throw new Error(`Report generation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.html_content;
  } catch (error) {
    console.error('Error generating report:', error);
    // Fallback to basic error message
    return `
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
  <h1>Error al generar reporte</h1>
  <p>${error.message}</p>
</body>
</html>
    `;
  }
}

/**
 * Genera HTML para múltiples reportes (impresión masiva) usando backend API
 */
async function generateBulkReportHTML(results) {
  try {
    const response = await fetch(`${API_URL}/api/v1/reports/generate-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        results: results
      }),
    });

    if (!response.ok) {
      throw new Error(`Bulk report generation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.html_content;
  } catch (error) {
    console.error('Error generating bulk report:', error);
    // Fallback to basic error message
    return `
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
  <h1>Error al generar reporte masivo</h1>
  <p>${error.message}</p>
</body>
</html>
    `;
  }
}

function BulkScreening({ disabled }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedResults, setSelectedResults] = useState(new Set());
  const [filePreview, setFilePreview] = useState(null); // Preview of CSV records
  
  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  
  // Estado de filtro
  const [filterType, setFilterType] = useState('all'); // 'all', 'hits', 'clear'
  
  const fileInputRef = useRef(null);

  // Parse CSV file for preview
  const parseCSVPreview = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          setFilePreview({ headers: [], rows: [], totalRows: 0 });
          return;
        }
        
        // Simple CSV parser that handles quoted values
        const parseCSVLine = (line) => {
          const values = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++; // Skip escaped quote
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());
          return values;
        };
        
        // Parse headers
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
        
        // Parse rows (max 5 for preview)
        const rows = [];
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const values = parseCSVLine(lines[i]);
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          rows.push(row);
        }
        
        setFilePreview({
          headers,
          rows,
          totalRows: lines.length - 1 // Exclude header
        });
      } catch (err) {
        console.error('Error parsing CSV:', err);
        setFilePreview(null);
      }
    };
    reader.readAsText(file);
  }, []);

  // Filtrar resultados
  const filteredResults = useMemo(() => {
    if (!results?.results) return [];
    switch (filterType) {
      case 'hits':
        return results.results.filter(r => r.is_hit);
      case 'clear':
        return results.results.filter(r => !r.is_hit);
      default:
        return results.results;
    }
  }, [results, filterType]);

  // Calcular paginación
  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredResults.length);
  const paginatedResults = filteredResults.slice(startIndex, endIndex);

  // Reset página cuando cambia el filtro
  const handleFilterChange = (newFilter) => {
    setFilterType(newFilter);
    setCurrentPage(1);
  };

  // Cambiar tamaño de página
  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Descargar plantilla CSV
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sanctions-check_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Manejar selección de archivo
  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  // Validar y establecer archivo
  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Por favor, seleccione un archivo CSV');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('El archivo no debe exceder 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResults(null);
    setSelectedResults(new Set());
    setCurrentPage(1);
    // Parse CSV for preview
    parseCSVPreview(selectedFile);
  };

  // Manejar drag & drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  // Procesar archivo
  const handleSubmit = async () => {
    if (!file || loading) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_URL}/api/v1/screen/bulk`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errorMessage = `Error del servidor (${response.status})`;
        try {
          const errorText = await response.text();
          if (errorText) errorMessage = `${errorMessage}: ${errorText}`;
        } catch {
          // Ignorar error al leer texto
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResults(data);
      setSelectedResults(new Set());
      setCurrentPage(1);
      setFilterType('all');
    } catch (err) {
      const message = err.name === 'TypeError'
        ? 'Error de red: No se puede conectar al servidor'
        : err.message;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Limpiar selección
  const handleClear = () => {
    setFile(null);
    setResults(null);
    setError(null);
    setSelectedResults(new Set());
    setCurrentPage(1);
    setFilterType('all');
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Escapar campo CSV
  const escapeCSVField = (field) => {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Exportar resultados CSV
  const exportResults = useCallback(() => {
    if (!results?.results) return;

    const csvRows = [
      ['Nombre', 'Documento', 'País', 'Resultado', 'Coincidencias', 'Recomendación']
    ];

    results.results.forEach(r => {
      const recommendation = r.is_hit && r.matches?.[0]?.recommendation 
        ? r.matches[0].recommendation 
        : 'APPROVE';
      
      csvRows.push([
        escapeCSVField(r.input?.nombre || ''),
        escapeCSVField(r.input?.cedula || ''),
        escapeCSVField(r.input?.pais || ''),
        r.is_hit ? 'COINCIDENCIA' : 'LIMPIO',
        r.hit_count || 0,
        recommendation
      ]);
    });

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sanctions-check_resultados_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [results]);

  // Guardar resultados como JSON
  const saveResultsJSON = useCallback(() => {
    if (!results) return;
    
    const dataStr = JSON.stringify(results, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sanctions-check_resultados_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [results]);

  // Ver reporte individual usando API del backend
  const viewReport = useCallback(async (result) => {
    try {
      const html = await generateReportHTML(result);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error viewing report:', error);
      alert('Error al generar el reporte. Por favor, intente nuevamente.');
    }
  }, []);

  // Obtener índice real en results.results
  const getRealIndex = useCallback((filteredIndex) => {
    const item = filteredResults[filteredIndex];
    return results?.results?.indexOf(item) ?? filteredIndex;
  }, [filteredResults, results]);

  // Seleccionar/deseleccionar resultado (usando índice real)
  const toggleSelection = useCallback((filteredIndex) => {
    const realIndex = getRealIndex(filteredIndex);
    setSelectedResults(prev => {
      const next = new Set(prev);
      if (next.has(realIndex)) {
        next.delete(realIndex);
      } else {
        next.add(realIndex);
      }
      return next;
    });
  }, [getRealIndex]);

  // Verificar si un resultado está seleccionado
  const isSelected = useCallback((filteredIndex) => {
    const realIndex = getRealIndex(filteredIndex);
    return selectedResults.has(realIndex);
  }, [getRealIndex, selectedResults]);

  // Seleccionar todos los de la página actual
  const selectAllOnPage = useCallback(() => {
    const newSelected = new Set(selectedResults);
    for (let i = startIndex; i < endIndex; i++) {
      const realIndex = results?.results?.indexOf(filteredResults[i]);
      if (realIndex !== undefined && realIndex !== -1) {
        newSelected.add(realIndex);
      }
    }
    setSelectedResults(newSelected);
  }, [selectedResults, startIndex, endIndex, filteredResults, results]);

  // Deseleccionar todos los de la página actual
  const deselectAllOnPage = useCallback(() => {
    const newSelected = new Set(selectedResults);
    for (let i = startIndex; i < endIndex; i++) {
      const realIndex = results?.results?.indexOf(filteredResults[i]);
      if (realIndex !== undefined && realIndex !== -1) {
        newSelected.delete(realIndex);
      }
    }
    setSelectedResults(newSelected);
  }, [selectedResults, startIndex, endIndex, filteredResults, results]);

  // Seleccionar todos los resultados
  const selectAll = useCallback(() => {
    if (!results?.results) return;
    setSelectedResults(new Set(results.results.map((_, i) => i)));
  }, [results]);

  // Seleccionar todos los hits
  const selectAllHits = useCallback(() => {
    if (!results?.results) return;
    const hitIndices = results.results
      .map((r, i) => r.is_hit ? i : -1)
      .filter(i => i !== -1);
    setSelectedResults(new Set(hitIndices));
  }, [results]);

  // Deseleccionar todos
  const clearSelection = useCallback(() => {
    setSelectedResults(new Set());
  }, []);

  // Verificar si todos en la página están seleccionados
  const allOnPageSelected = useMemo(() => {
    if (paginatedResults.length === 0) return false;
    for (let i = 0; i < paginatedResults.length; i++) {
      const realIndex = results?.results?.indexOf(paginatedResults[i]);
      if (!selectedResults.has(realIndex)) return false;
    }
    return true;
  }, [paginatedResults, results, selectedResults]);

  // Imprimir seleccionados usando API del backend
  const printSelected = useCallback(async () => {
    if (!results?.results || selectedResults.size === 0) return;
    
    try {
      const selectedData = Array.from(selectedResults)
        .sort((a, b) => a - b)
        .map(i => results.results[i])
        .filter(Boolean);
      
      const html = await generateBulkReportHTML(selectedData);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error printing selected:', error);
      alert('Error al generar el reporte. Por favor, intente nuevamente.');
    }
  }, [results, selectedResults]);

  // Imprimir todos usando API del backend
  const printAll = useCallback(async () => {
    if (!results?.results) return;
    
    try {
      const html = await generateBulkReportHTML(results.results);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error printing all:', error);
      alert('Error al generar el reporte. Por favor, intente nuevamente.');
    }
  }, [results]);

  // Generar rango de páginas para mostrar
  const getPageRange = () => {
    const range = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      range.push(i);
    }
    return range;
  };

  return (
    <div className="bulk-screening">
      <div className="bulk-header">
        <h2>📋 Screening Masivo</h2>
        <p className="bulk-description">
          Cargue un archivo CSV con múltiples personas para verificar simultáneamente contra las listas OFAC y ONU
        </p>
      </div>

      {/* Sección de descarga de plantilla */}
      <div className="template-section">
        <button 
          onClick={downloadTemplate}
          className="btn btn-outline"
          type="button"
        >
          📥 Descargar Plantilla CSV
        </button>
        <span className="template-hint">
          Use esta plantilla para formatear correctamente sus datos
        </span>
      </div>

      {/* Área de carga de archivo */}
      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv"
          className="file-input-hidden"
          disabled={disabled || loading}
        />

        {file ? (
          <div className="file-selected" onClick={(e) => e.stopPropagation()}>
            <div className="file-selected-header">
              <span className="file-icon-success">✅</span>
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  {(file.size / 1024).toFixed(1)} KB
                  {filePreview && ` • ${filePreview.totalRows} registros`}
                </span>
              </div>
              <button
                type="button"
                className="btn-change-file"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                title="Cambiar archivo"
              >
                🔄 Cambiar
              </button>
            </div>
            
            {/* Vista previa de registros */}
            {filePreview && filePreview.rows.length > 0 && (
              <div className="file-preview">
                <div className="file-preview-header">
                  <span className="preview-title">📋 Vista previa ({Math.min(5, filePreview.rows.length)} de {filePreview.totalRows} registros)</span>
                </div>
                <div className="file-preview-table-container">
                  <table className="file-preview-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Nombre</th>
                        <th>Documento</th>
                        <th>País</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filePreview.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{row.nombre || row.name || '-'}</td>
                          <td>{row.cedula || row.documento || row.document || '-'}</td>
                          <td>{row.pais || row.country || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filePreview.totalRows > 5 && (
                  <div className="preview-more">
                    ... y {filePreview.totalRows - 5} registros más
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="upload-placeholder">
            <span className="upload-icon">📤</span>
            <p className="upload-text">
              Arrastre un archivo CSV aquí o haga clic para seleccionar
            </p>
            <p className="upload-hint">Máximo 10MB</p>
          </div>
        )}
      </div>

      {/* Mensaje de error */}
      {error && (
        <div className="bulk-error">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* Indicador de carga mejorado */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner-large"></div>
            <p className="loading-text">Procesando verificaciones...</p>
            <p className="loading-subtext">Consultando listas OFAC y ONU</p>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="bulk-actions">
        <button
          type="button"
          onClick={handleClear}
          className="btn btn-secondary"
          disabled={loading || (!file && !results)}
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="btn btn-primary"
          disabled={disabled || loading || !file}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Procesando...
            </>
          ) : (
            <>🚀 Procesar Archivo</>
          )}
        </button>
      </div>

      {/* Resultados */}
      {results && (
        <div className="bulk-results">
          <div className="results-summary">
            <h3>📊 Resumen de Resultados</h3>
            <div className="summary-stats">
              <div className="stat-card">
                <span className="stat-value">{results.total_processed}</span>
                <span className="stat-label">Procesados</span>
              </div>
              <div className="stat-card hit">
                <span className="stat-value">{results.hits}</span>
                <span className="stat-label">Coincidencias</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{results.hit_rate}</span>
                <span className="stat-label">Tasa de Hits</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{results.processing_time_ms}ms</span>
                <span className="stat-label">Tiempo</span>
              </div>
            </div>
          </div>

          {/* Barra de herramientas de acciones */}
          <div className="results-toolbar">
            {/* Sección de filtros */}
            <div className="toolbar-section">
              <label className="toolbar-label">Filtrar:</label>
              <div className="filter-buttons">
                <button
                  type="button"
                  className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
                  onClick={() => handleFilterChange('all')}
                >
                  Todos ({results.total_processed})
                </button>
                <button
                  type="button"
                  className={`filter-btn filter-hits ${filterType === 'hits' ? 'active' : ''}`}
                  onClick={() => handleFilterChange('hits')}
                >
                  ⚠️ Hits ({results.hits})
                </button>
                <button
                  type="button"
                  className={`filter-btn filter-clear ${filterType === 'clear' ? 'active' : ''}`}
                  onClick={() => handleFilterChange('clear')}
                >
                  ✅ Limpios ({results.total_processed - results.hits})
                </button>
              </div>
            </div>

            {/* Sección de selección */}
            <div className="toolbar-section">
              <label className="toolbar-label">Selección:</label>
              <div className="selection-buttons">
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={selectAll}
                  title="Seleccionar todos los registros"
                >
                  ☑️ Todo ({results.total_processed})
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={selectAllHits}
                  disabled={results.hits === 0}
                  title="Seleccionar solo coincidencias"
                >
                  ⚠️ Hits ({results.hits})
                </button>
                {selectedResults.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={clearSelection}
                  >
                    ✕ Limpiar ({selectedResults.size})
                  </button>
                )}
              </div>
            </div>

            {/* Sección de exportación */}
            <div className="toolbar-section">
              <label className="toolbar-label">Guardar:</label>
              <div className="export-buttons">
                <button
                  type="button"
                  onClick={exportResults}
                  className="btn btn-sm btn-outline"
                  title="Exportar a CSV"
                >
                  📥 CSV
                </button>
                <button
                  type="button"
                  onClick={saveResultsJSON}
                  className="btn btn-sm btn-outline"
                  title="Guardar como JSON"
                >
                  💾 JSON
                </button>
                <button
                  type="button"
                  onClick={printAll}
                  className="btn btn-sm btn-outline"
                  title="Generar reporte HTML de todos"
                >
                  📄 Reporte
                </button>
                {selectedResults.size > 0 && (
                  <button
                    type="button"
                    onClick={printSelected}
                    className="btn btn-sm btn-primary"
                    title="Imprimir seleccionados"
                  >
                    🖨️ Imprimir ({selectedResults.size})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Información de paginación y controles */}
          <div className="pagination-info">
            <div className="page-size-selector">
              <label>Mostrar:</label>
              <select 
                value={pageSize} 
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="page-size-select"
              >
                {PAGE_SIZES.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>registros</span>
            </div>
            <div className="results-count">
              Mostrando {startIndex + 1}-{endIndex} de {filteredResults.length} registros
              {filterType !== 'all' && ` (filtrado de ${results.total_processed})`}
            </div>
          </div>

          {/* Tabla de resultados mejorada */}
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th style={{width: '40px'}}>
                    <input 
                      type="checkbox" 
                      checked={allOnPageSelected && paginatedResults.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          selectAllOnPage();
                        } else {
                          deselectAllOnPage();
                        }
                      }}
                      title="Seleccionar/deseleccionar página actual"
                    />
                  </th>
                  <th style={{width: '50px'}}>#</th>
                  <th>Nombre</th>
                  <th>Documento</th>
                  <th>País</th>
                  <th style={{width: '100px'}}>Estado</th>
                  <th style={{width: '60px'}}>Hits</th>
                  <th style={{width: '120px'}}>Recomendación</th>
                  <th style={{width: '80px'}}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedResults.map((r, pageIndex) => {
                  const globalIndex = startIndex + pageIndex;
                  return (
                    <BulkResultRow 
                      key={r.screening_id || globalIndex} 
                      result={r} 
                      displayIndex={globalIndex + 1}
                      selected={isSelected(globalIndex)}
                      onToggle={() => toggleSelection(globalIndex)}
                      onViewReport={() => viewReport(r)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Controles de paginación */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="Primera página"
              >
                ⏮️
              </button>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                title="Página anterior"
              >
                ◀️
              </button>
              
              <div className="pagination-pages">
                {getPageRange().map(page => (
                  <button
                    key={page}
                    type="button"
                    className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                title="Página siguiente"
              >
                ▶️
              </button>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                title="Última página"
              >
                ⏭️
              </button>
              
              <div className="pagination-jump">
                <span>Ir a:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  className="page-jump-input"
                />
                <span>de {totalPages}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * BulkResultRow - Fila de resultado en la tabla con acciones
 */
function BulkResultRow({ result, displayIndex, selected, onToggle, onViewReport }) {
  const { input, is_hit, hit_count, matches } = result;
  const recommendation = is_hit && matches?.[0]?.recommendation 
    ? matches[0].recommendation 
    : 'APPROVE';

  // Handle different field name conventions
  const nombre = input?.nombre || input?.name || '-';
  const documento = input?.cedula || input?.document || input?.documento || '-';
  const pais = input?.pais || input?.country || '-';

  const getRecommendationClass = () => {
    switch (recommendation) {
      case 'AUTO_ESCALATE':
      case 'REJECT': return 'badge-reject';
      case 'REVIEW':
      case 'MANUAL_REVIEW':
      case 'LOW_CONFIDENCE_REVIEW': return 'badge-review';
      default: return 'badge-approve';
    }
  };

  const getRecommendationText = () => {
    switch (recommendation) {
      case 'AUTO_ESCALATE': return 'ESCALAR';
      case 'REJECT': return 'RECHAZAR';
      case 'REVIEW':
      case 'MANUAL_REVIEW':
      case 'LOW_CONFIDENCE_REVIEW': return 'REVISAR';
      case 'AUTO_CLEAR': return 'AUTO OK';
      default: return 'APROBAR';
    }
  };

  return (
    <tr className={`${is_hit ? 'row-hit' : 'row-clear'} ${selected ? 'row-selected' : ''}`}>
      <td>
        <input 
          type="checkbox" 
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td className="row-number">{displayIndex}</td>
      <td className="cell-name"><strong>{nombre}</strong></td>
      <td>{documento}</td>
      <td>{pais}</td>
      <td>
        <span className={`result-badge ${is_hit ? 'hit' : 'clear'}`}>
          {is_hit ? '⚠️ HIT' : '✅ OK'}
        </span>
      </td>
      <td className="text-center">{hit_count || 0}</td>
      <td>
        <span className={`recommendation-badge-small ${getRecommendationClass()}`}>
          {getRecommendationText()}
        </span>
      </td>
      <td>
        <button 
          type="button"
          className="btn-view-report"
          onClick={onViewReport}
          title="Ver reporte detallado"
        >
          👁️ Ver
        </button>
      </td>
    </tr>
  );
}

BulkScreening.propTypes = {
  disabled: PropTypes.bool
};

BulkResultRow.propTypes = {
  result: PropTypes.object.isRequired,
  displayIndex: PropTypes.number.isRequired,
  selected: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onViewReport: PropTypes.func.isRequired
};

export default BulkScreening;
