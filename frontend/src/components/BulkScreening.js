import React, { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * BulkScreening - Componente para screening masivo por CSV
 * Versión 2.0: Incluye visor de reportes HTML para hits individuales y generación masiva
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Plantilla CSV para descargar
const CSV_TEMPLATE = `nombre,cedula,pais,fecha_nacimiento,nacionalidad
Juan Pérez García,8-888-8888,PA,1985-03-15,PA
María López Rodríguez,9-999-9999,PA,1990-07-22,CO
Carlos Hernández,,CO,,VE`;

/**
 * Genera HTML profesional para un reporte de screening individual
 */
function generateReportHTML(result, index) {
  const { input, is_hit, hit_count, matches, screening_id } = result;
  const timestamp = new Date().toLocaleString('es-PA');
  
  const matchesHTML = is_hit && matches?.length > 0 
    ? matches.map((match, i) => {
        const entity = match.entity || {};
        const confidence = match.confidence || {};
        const confidenceLevel = confidence.overall || 0;
        const confidenceClass = confidenceLevel >= 90 ? 'high' : confidenceLevel >= 70 ? 'medium' : 'low';
        
        return `
          <div class="match-card">
            <div class="match-header">
              <span class="match-number">#${i + 1}</span>
              <span class="confidence ${confidenceClass}">${confidenceLevel.toFixed(1)}%</span>
            </div>
            <div class="match-details">
              <div class="detail-row">
                <span class="label">Nombre en Lista:</span>
                <span class="value primary">${entity.name || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Fuente:</span>
                <span class="value source">${entity.source || 'N/A'}</span>
              </div>
              ${entity.program ? `
              <div class="detail-row">
                <span class="label">Programa:</span>
                <span class="value">${entity.program}</span>
              </div>` : ''}
              ${entity.type ? `
              <div class="detail-row">
                <span class="label">Tipo:</span>
                <span class="value">${entity.type === 'individual' ? 'Persona' : 'Entidad'}</span>
              </div>` : ''}
              ${entity.countries?.length ? `
              <div class="detail-row">
                <span class="label">Países:</span>
                <span class="value">${entity.countries.join(', ')}</span>
              </div>` : ''}
              ${entity.aliases?.length ? `
              <div class="detail-row">
                <span class="label">Alias:</span>
                <span class="value aliases">${entity.aliases.slice(0, 5).join(', ')}${entity.aliases.length > 5 ? ` (+${entity.aliases.length - 5} más)` : ''}</span>
              </div>` : ''}
              <div class="detail-row">
                <span class="label">Recomendación:</span>
                <span class="value recommendation ${match.recommendation?.toLowerCase() || 'review'}">${
                  match.recommendation === 'REJECT' ? '🚫 RECHAZAR' :
                  match.recommendation === 'APPROVE' ? '✅ APROBAR' : '⚠️ REVISAR'
                }</span>
              </div>
            </div>
          </div>
        `;
      }).join('')
    : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Screening - ${input?.nombre || 'N/A'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background: #f8fafc;
      padding: 20px;
    }
    .report {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      padding: 30px;
      text-align: center;
      color: white;
      background: ${is_hit ? 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' : 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)'};
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      opacity: 0.9;
      font-size: 14px;
    }
    .status-badge {
      display: inline-block;
      padding: 8px 20px;
      margin-top: 15px;
      background: rgba(255,255,255,0.2);
      border-radius: 20px;
      font-weight: 600;
      font-size: 16px;
    }
    .content { padding: 30px; }
    .section {
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .section:last-child { border-bottom: none; margin-bottom: 0; }
    .section h2 {
      font-size: 16px;
      color: #0d1b2a;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
    }
    .info-label {
      font-weight: 600;
      color: #64748b;
      font-size: 13px;
    }
    .info-value {
      font-weight: 500;
    }
    .match-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 15px;
    }
    .match-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .match-number {
      font-weight: 700;
      color: #64748b;
    }
    .confidence {
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 14px;
    }
    .confidence.high { background: #fee2e2; color: #dc2626; }
    .confidence.medium { background: #fef3c7; color: #d97706; }
    .confidence.low { background: #dcfce7; color: #16a34a; }
    .match-details .detail-row {
      display: flex;
      padding: 6px 0;
    }
    .detail-row .label {
      flex: 0 0 140px;
      font-size: 13px;
      color: #64748b;
    }
    .detail-row .value {
      flex: 1;
      font-weight: 500;
    }
    .detail-row .value.primary {
      font-size: 16px;
      color: #0d1b2a;
    }
    .detail-row .value.source {
      display: inline-block;
      background: #1b3a5c;
      color: white;
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 12px;
    }
    .detail-row .value.aliases {
      font-style: italic;
      font-size: 13px;
    }
    .detail-row .value.recommendation {
      font-weight: 700;
    }
    .recommendation.reject { color: #dc2626; }
    .recommendation.approve { color: #16a34a; }
    .recommendation.review, .recommendation.manual_review { color: #d97706; }
    .footer {
      padding: 20px 30px;
      background: #f8fafc;
      font-size: 12px;
      color: #64748b;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .no-print { }
    @media print {
      body { padding: 0; background: white; }
      .report { box-shadow: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h1>🛡️ SDNCheck PA</h1>
      <div class="subtitle">Constancia de Verificación de Sanciones</div>
      <div class="status-badge">
        ${is_hit ? '⚠️ COINCIDENCIA ENCONTRADA' : '✅ SIN COINCIDENCIAS'}
      </div>
    </div>
    
    <div class="content">
      <div class="section">
        <h2>📋 Información del Sujeto</h2>
        <div class="info-grid">
          <div class="info-label">Nombre:</div>
          <div class="info-value">${input?.nombre || 'N/A'}</div>
          
          <div class="info-label">Documento:</div>
          <div class="info-value">${input?.cedula || 'N/A'}</div>
          
          <div class="info-label">País:</div>
          <div class="info-value">${input?.pais || 'N/A'}</div>
          
          <div class="info-label">ID Screening:</div>
          <div class="info-value" style="font-family: monospace; font-size: 12px;">${screening_id || 'N/A'}</div>
          
          <div class="info-label">Fecha:</div>
          <div class="info-value">${timestamp}</div>
        </div>
      </div>
      
      ${is_hit ? `
      <div class="section">
        <h2>⚠️ Coincidencias Detectadas (${hit_count})</h2>
        ${matchesHTML}
      </div>
      ` : `
      <div class="section" style="text-align: center; padding: 30px 0;">
        <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
        <h2 style="color: #16a34a; margin-bottom: 10px;">Sin Coincidencias</h2>
        <p style="color: #64748b;">
          No se encontraron coincidencias en las listas de sanciones OFAC y ONU.
        </p>
      </div>
      `}
    </div>
    
    <div class="footer">
      <p><strong>Documento generado automáticamente por SDNCheck PA</strong></p>
      <p>Este reporte es válido únicamente para la fecha indicada. Las listas de sanciones se actualizan frecuentemente.</p>
      <p style="margin-top: 10px;">Verificación contra listas OFAC (EE.UU.) y ONU</p>
    </div>
  </div>
  
  <div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="
      padding: 12px 30px;
      background: linear-gradient(135deg, #00b4d8 0%, #0096c7 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    ">🖨️ Imprimir Reporte</button>
  </div>
</body>
</html>
  `;
}

/**
 * Genera HTML para múltiples reportes (impresión masiva)
 */
function generateBulkReportHTML(results) {
  const timestamp = new Date().toLocaleString('es-PA');
  const hits = results.filter(r => r.is_hit);
  const clears = results.filter(r => !r.is_hit);
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Masivo de Screening - SDNCheck PA</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      background: #f8fafc;
      padding: 20px;
    }
    .report {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      padding: 30px;
      text-align: center;
      color: white;
      background: linear-gradient(135deg, #0d1b2a 0%, #1b3a5c 100%);
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header .subtitle { opacity: 0.9; font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      padding: 25px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .summary-card {
      text-align: center;
      padding: 15px;
      background: white;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }
    .summary-card.hit { background: #fee2e2; border-color: #fecaca; }
    .summary-value { font-size: 28px; font-weight: 800; color: #0d1b2a; }
    .summary-card.hit .summary-value { color: #dc2626; }
    .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .content { padding: 25px; }
    .section-title {
      font-size: 18px;
      color: #0d1b2a;
      margin: 25px 0 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .results-table th {
      background: #0d1b2a;
      color: white;
      padding: 12px 10px;
      text-align: left;
      font-weight: 600;
    }
    .results-table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .results-table tr:hover { background: #f8fafc; }
    .results-table tr.row-hit { background: #fee2e2; }
    .results-table tr.row-hit:hover { background: #fecaca; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge.hit { background: #dc2626; color: white; }
    .badge.clear { background: #16a34a; color: white; }
    .badge.reject { background: #fee2e2; color: #dc2626; }
    .badge.review { background: #fef3c7; color: #d97706; }
    .badge.approve { background: #dcfce7; color: #16a34a; }
    .footer {
      padding: 20px;
      background: #f8fafc;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .page-break { page-break-after: always; }
    @media print {
      body { padding: 0; background: white; }
      .report { box-shadow: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h1>🛡️ SDNCheck PA</h1>
      <div class="subtitle">Reporte Masivo de Verificación de Sanciones</div>
    </div>
    
    <div class="summary">
      <div class="summary-card">
        <div class="summary-value">${results.length}</div>
        <div class="summary-label">Total Procesados</div>
      </div>
      <div class="summary-card hit">
        <div class="summary-value">${hits.length}</div>
        <div class="summary-label">Coincidencias</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${clears.length}</div>
        <div class="summary-label">Sin Coincidencias</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${((hits.length / results.length) * 100).toFixed(1)}%</div>
        <div class="summary-label">Tasa de Hits</div>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">📊 Detalle de Resultados</div>
      <table class="results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>Documento</th>
            <th>País</th>
            <th>Estado</th>
            <th>Hits</th>
            <th>Recomendación</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((r, i) => {
            const rec = r.is_hit && r.matches?.[0]?.recommendation 
              ? r.matches[0].recommendation 
              : 'APPROVE';
            return `
              <tr class="${r.is_hit ? 'row-hit' : ''}">
                <td>${i + 1}</td>
                <td><strong>${r.input?.nombre || '-'}</strong></td>
                <td>${r.input?.cedula || '-'}</td>
                <td>${r.input?.pais || '-'}</td>
                <td><span class="badge ${r.is_hit ? 'hit' : 'clear'}">${r.is_hit ? '⚠️ HIT' : '✅ OK'}</span></td>
                <td>${r.hit_count || 0}</td>
                <td><span class="badge ${rec.toLowerCase()}">${
                  rec === 'REJECT' ? 'RECHAZAR' :
                  rec === 'APPROVE' ? 'APROBAR' : 'REVISAR'
                }</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="footer">
      <p><strong>Generado: ${timestamp}</strong> | SDNCheck PA - Verificación OFAC & ONU</p>
    </div>
  </div>
  
  <div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="
      padding: 12px 30px;
      background: linear-gradient(135deg, #00b4d8 0%, #0096c7 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    ">🖨️ Imprimir Reporte</button>
  </div>
</body>
</html>
  `;
}

function BulkScreening({ disabled }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedResults, setSelectedResults] = useState(new Set());
  const fileInputRef = useRef(null);

  // Descargar plantilla CSV
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sdncheck_template.csv';
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
  const exportResults = () => {
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
    link.download = `sdncheck_resultados_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Ver reporte individual
  const viewReport = useCallback((result, index) => {
    const html = generateReportHTML(result, index);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  // Seleccionar/deseleccionar resultado
  const toggleSelection = useCallback((index) => {
    setSelectedResults(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

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

  // Imprimir seleccionados
  const printSelected = useCallback(() => {
    if (!results?.results || selectedResults.size === 0) return;
    
    const selectedData = Array.from(selectedResults)
      .sort((a, b) => a - b)
      .map(i => results.results[i]);
    
    const html = generateBulkReportHTML(selectedData);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [results, selectedResults]);

  // Imprimir todos
  const printAll = useCallback(() => {
    if (!results?.results) return;
    
    const html = generateBulkReportHTML(results.results);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [results]);

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
        onClick={() => fileInputRef.current?.click()}
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
          <div className="file-selected">
            <span className="file-icon">📄</span>
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="file-size">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <button
              type="button"
              className="btn-remove"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            >
              ✕
            </button>
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

          {/* Botones de exportación y reportes */}
          <div className="export-section">
            <button
              type="button"
              onClick={exportResults}
              className="btn btn-outline"
            >
              📥 Exportar CSV
            </button>
            <button
              type="button"
              onClick={printAll}
              className="btn btn-outline"
            >
              📄 Reporte Completo
            </button>
            <button
              type="button"
              onClick={selectAllHits}
              className="btn btn-secondary"
              disabled={results.hits === 0}
            >
              ⚠️ Seleccionar Hits ({results.hits})
            </button>
            {selectedResults.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="btn btn-secondary"
                >
                  Deseleccionar
                </button>
                <button
                  type="button"
                  onClick={printSelected}
                  className="btn btn-primary"
                >
                  🖨️ Imprimir Seleccionados ({selectedResults.size})
                </button>
              </>
            )}
          </div>

          {/* Tabla de resultados mejorada */}
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th style={{width: '40px'}}>
                    <input 
                      type="checkbox" 
                      checked={selectedResults.size === results.results?.length && results.results?.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedResults(new Set(results.results.map((_, i) => i)));
                        } else {
                          setSelectedResults(new Set());
                        }
                      }}
                    />
                  </th>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Documento</th>
                  <th>País</th>
                  <th>Resultado</th>
                  <th>Hits</th>
                  <th>Recomendación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {results.results?.map((r, index) => (
                  <BulkResultRow 
                    key={r.screening_id || index} 
                    result={r} 
                    index={index}
                    selected={selectedResults.has(index)}
                    onToggle={() => toggleSelection(index)}
                    onViewReport={() => viewReport(r, index)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * BulkResultRow - Fila de resultado en la tabla con acciones
 */
function BulkResultRow({ result, index, selected, onToggle, onViewReport }) {
  const { input, is_hit, hit_count, matches } = result;
  const recommendation = is_hit && matches?.[0]?.recommendation 
    ? matches[0].recommendation 
    : 'APPROVE';

  const getRecommendationClass = () => {
    switch (recommendation) {
      case 'REJECT': return 'badge-reject';
      case 'REVIEW':
      case 'MANUAL_REVIEW': return 'badge-review';
      default: return 'badge-approve';
    }
  };

  const getRecommendationText = () => {
    switch (recommendation) {
      case 'REJECT': return 'RECHAZAR';
      case 'REVIEW':
      case 'MANUAL_REVIEW': return 'REVISAR';
      default: return 'APROBAR';
    }
  };

  return (
    <tr className={is_hit ? 'row-hit' : 'row-clear'}>
      <td>
        <input 
          type="checkbox" 
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td>{index + 1}</td>
      <td><strong>{input?.nombre || '-'}</strong></td>
      <td>{input?.cedula || '-'}</td>
      <td>{input?.pais || '-'}</td>
      <td>
        <span className={`result-badge ${is_hit ? 'hit' : 'clear'}`}>
          {is_hit ? '⚠️ HIT' : '✅ OK'}
        </span>
      </td>
      <td>{hit_count || 0}</td>
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
  index: PropTypes.number.isRequired,
  selected: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onViewReport: PropTypes.func.isRequired
};

export default BulkScreening;
