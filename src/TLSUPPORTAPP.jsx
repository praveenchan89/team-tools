import React, { useState } from 'react';
import { FileText, Package, Database, AlertCircle, CheckCircle, Info, Home, Menu, X, Upload, Download, Search, Clock, Calendar, XCircle } from 'lucide-react';

const TraceLinkSupportApp = () => {
  const [activeApp, setActiveApp] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // EPCIS Timestamp Validator State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serialNumberData, setSerialNumberData] = useState([]);

  // Sub-applications configuration
  const subApps = [
    { id: 'home', name: 'Dashboard', icon: Home, color: 'bg-blue-500' },
    { id: 'epcis', name: 'EPCIS Timestamp Validator', icon: FileText, color: 'bg-green-500' },
    { id: 'network', name: 'Network Diagnostics', icon: Database, color: 'bg-purple-500' },
    { id: 'packages', name: 'Package Validator', icon: Package, color: 'bg-orange-500' },
  ];

  // Parse EPCIS file and extract events
  const parseEPCISFile = async (fileContent) => {
    const isJSON = fileContent.trim().startsWith('{') || fileContent.trim().startsWith('[');
    
    if (isJSON) {
      return parseEPCISJSON(fileContent);
    } else {
      return parseEPCISXML(fileContent);
    }
  };

  // Parse EPCIS JSON format
  const parseEPCISJSON = (content) => {
    try {
      const data = JSON.parse(content);
      const events = [];
      
      // Navigate to event list (structure may vary)
      const eventList = data.epcisBody?.eventList || 
                       data.EPCISDocument?.EPCISBody?.EventList ||
                       data.eventList || [];
      
      // Extract all events
      const allEvents = [
        ...(eventList.ObjectEvent || []),
        ...(eventList.AggregationEvent || []),
        ...(eventList.TransactionEvent || [])
      ];
      
      allEvents.forEach(event => {
        const eventTime = event.eventTime;
        const action = event.action;
        const epcs = event.epcList || [];
        
        // Determine event type based on action and business step
        let eventType = 'Unknown';
        const bizStep = event.bizStep || '';
        
        if (bizStep.includes('commissioning') || action === 'ADD') {
          eventType = 'Commission';
        } else if (eventType === 'AggregationEvent' || bizStep.includes('packing')) {
          eventType = 'Aggregation';
        } else if (bizStep.includes('shipping') || bizStep.includes('departing')) {
          eventType = 'Shipment';
        }
        
        epcs.forEach(epc => {
          events.push({
            serialNumber: extractSerialNumber(epc),
            eventType: eventType,
            timestamp: new Date(eventTime),
            rawTimestamp: eventTime,
            businessStep: bizStep
          });
        });
      });
      
      return events;
    } catch (error) {
      throw new Error(`JSON parsing error: ${error.message}`);
    }
  };

  // Parse EPCIS XML format
  const parseEPCISXML = (content) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      const events = [];
      
      // Check for parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Invalid XML format');
      }
      
      // Get all event types
      const objectEvents = xmlDoc.querySelectorAll('ObjectEvent');
      const aggregationEvents = xmlDoc.querySelectorAll('AggregationEvent');
      const transactionEvents = xmlDoc.querySelectorAll('TransactionEvent');
      
      // Process Object Events
      objectEvents.forEach(event => {
        const eventTime = event.querySelector('eventTime')?.textContent;
        const action = event.querySelector('action')?.textContent;
        const bizStep = event.querySelector('bizStep')?.textContent || '';
        const epcList = event.querySelectorAll('epc');
        
        let eventType = 'Commission';
        if (bizStep.includes('shipping') || bizStep.includes('departing')) {
          eventType = 'Shipment';
        } else if (bizStep.includes('packing')) {
          eventType = 'Aggregation';
        }
        
        epcList.forEach(epc => {
          events.push({
            serialNumber: extractSerialNumber(epc.textContent),
            eventType: eventType,
            timestamp: new Date(eventTime),
            rawTimestamp: eventTime,
            businessStep: bizStep
          });
        });
      });
      
      // Process Aggregation Events
      aggregationEvents.forEach(event => {
        const eventTime = event.querySelector('eventTime')?.textContent;
        const childEPCs = event.querySelectorAll('childEPCs epc');
        const bizStep = event.querySelector('bizStep')?.textContent || '';
        
        childEPCs.forEach(epc => {
          events.push({
            serialNumber: extractSerialNumber(epc.textContent),
            eventType: 'Aggregation',
            timestamp: new Date(eventTime),
            rawTimestamp: eventTime,
            businessStep: bizStep
          });
        });
      });
      
      // Process Transaction Events (often used for shipments)
      transactionEvents.forEach(event => {
        const eventTime = event.querySelector('eventTime')?.textContent;
        const epcList = event.querySelectorAll('epcList epc');
        const bizStep = event.querySelector('bizStep')?.textContent || '';
        
        let eventType = 'Shipment';
        if (bizStep.includes('commissioning')) {
          eventType = 'Commission';
        }
        
        epcList.forEach(epc => {
          events.push({
            serialNumber: extractSerialNumber(epc.textContent),
            eventType: eventType,
            timestamp: new Date(eventTime),
            rawTimestamp: eventTime,
            businessStep: bizStep
          });
        });
      });
      
      return events;
    } catch (error) {
      throw new Error(`XML parsing error: ${error.message}`);
    }
  };

  // Extract serial number from EPC URI
  const extractSerialNumber = (epc) => {
    // Handle different EPC formats
    // urn:epc:id:sgtin:0614141.107346.2017
    // urn:epc:id:sscc:0614141.1234567890
    
    if (epc.includes(':')) {
      const parts = epc.split(':');
      return parts[parts.length - 1] || epc;
    }
    return epc;
  };

  // Organize events by serial number
  const organizeEventsBySerial = (events) => {
    const serialMap = new Map();
    
    events.forEach(event => {
      if (!serialMap.has(event.serialNumber)) {
        serialMap.set(event.serialNumber, {
          serialNumber: event.serialNumber,
          commission: null,
          aggregation: null,
          shipment: null
        });
      }
      
      const serial = serialMap.get(event.serialNumber);
      
      if (event.eventType === 'Commission') {
        if (!serial.commission || event.timestamp < serial.commission.timestamp) {
          serial.commission = event;
        }
      } else if (event.eventType === 'Aggregation') {
        if (!serial.aggregation || event.timestamp > serial.aggregation.timestamp) {
          serial.aggregation = event;
        }
      } else if (event.eventType === 'Shipment') {
        if (!serial.shipment || event.timestamp > serial.shipment.timestamp) {
          serial.shipment = event;
        }
      }
    });
    
    return Array.from(serialMap.values());
  };

  // Validate timestamp chronological order
  const validateTimestamps = (serialData) => {
    const failures = [];
    let successCount = 0;
    
    serialData.forEach(serial => {
      const hasAllEvents = serial.commission && serial.aggregation && serial.shipment;
      
      if (!hasAllEvents) {
        // Skip if not all event types are present
        return;
      }
      
      const commissionTime = serial.commission.timestamp.getTime();
      const aggregationTime = serial.aggregation.timestamp.getTime();
      const shipmentTime = serial.shipment.timestamp.getTime();
      
      // Strict chronological check: Commission < Aggregation < Shipment
      const isValid = commissionTime < aggregationTime && aggregationTime < shipmentTime;
      
      if (isValid) {
        successCount++;
      } else {
        failures.push({
          serialNumber: serial.serialNumber,
          commissionTimestamp: serial.commission.rawTimestamp,
          aggregationTimestamp: serial.aggregation.rawTimestamp,
          shipmentTimestamp: serial.shipment.rawTimestamp,
          commissionDate: serial.commission.timestamp,
          aggregationDate: serial.aggregation.timestamp,
          shipmentDate: serial.shipment.timestamp,
          reason: getFailureReason(commissionTime, aggregationTime, shipmentTime)
        });
      }
    });
    
    return {
      status: failures.length === 0 ? 'Successful' : 'Failed',
      totalSerials: serialData.filter(s => s.commission && s.aggregation && s.shipment).length,
      successCount: successCount,
      failureCount: failures.length,
      failures: failures
    };
  };

  // Determine specific failure reason
  const getFailureReason = (commission, aggregation, shipment) => {
    const reasons = [];
    
    if (commission >= aggregation) {
      reasons.push('Commission timestamp is not before Aggregation timestamp');
    }
    if (aggregation >= shipment) {
      reasons.push('Aggregation timestamp is not before Shipment timestamp');
    }
    if (commission >= shipment) {
      reasons.push('Commission timestamp is not before Shipment timestamp');
    }
    if (commission === aggregation || aggregation === shipment || commission === shipment) {
      reasons.push('Equal timestamps detected (strict inequality required)');
    }
    
    return reasons.join('; ');
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setUploadedFile(file);
    setIsProcessing(true);
    setValidationResult(null);
    setSerialNumberData([]);
    
    try {
      const content = await file.text();
      const events = await parseEPCISFile(content);
      const organizedData = organizeEventsBySerial(events);
      const validation = validateTimestamps(organizedData);
      
      setSerialNumberData(organizedData);
      setValidationResult(validation);
    } catch (error) {
      setValidationResult({
        status: 'Error',
        error: error.message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export validation report
  const exportReport = () => {
    if (!validationResult) return;
    
    let report = `EPCIS Timestamp Validation Report\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `File: ${uploadedFile.name}\n`;
    report += `\n${'='.repeat(80)}\n\n`;
    report += `Validation Status: ${validationResult.status}\n`;
    report += `Total Serial Numbers Validated: ${validationResult.totalSerials}\n`;
    report += `Successful: ${validationResult.successCount}\n`;
    report += `Failed: ${validationResult.failureCount}\n`;
    report += `\n${'='.repeat(80)}\n\n`;
    
    if (validationResult.failures && validationResult.failures.length > 0) {
      report += `FAILED SERIAL NUMBERS:\n\n`;
      
      validationResult.failures.forEach((failure, index) => {
        report += `${index + 1}. Serial Number: ${failure.serialNumber}\n`;
        report += `   Commission Timestamp:  ${failure.commissionTimestamp}\n`;
        report += `   Aggregation Timestamp: ${failure.aggregationTimestamp}\n`;
        report += `   Shipment Timestamp:    ${failure.shipmentTimestamp}\n`;
        report += `   Failure Reason: ${failure.reason}\n`;
        report += `\n`;
      });
    }
    
    // Create and download file
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Dashboard Component
  const Dashboard = () => (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">TraceLink Support Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subApps.filter(app => app.id !== 'home').map(app => {
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              onClick={() => setActiveApp(app.id)}
              className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-l-4 border-blue-500 text-left"
            >
              <div className="flex items-center mb-3">
                <div className={`${app.color} p-3 rounded-lg`}>
                  <Icon className="text-white" size={24} />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{app.name}</h3>
              <p className="text-gray-600 text-sm">
                {app.id === 'epcis' && 'Validate serial number event timestamp chronology'}
                {app.id === 'network' && 'Diagnose network connectivity issues'}
                {app.id === 'packages' && 'Validate package structure and integrity'}
              </p>
            </button>
          );
        })}
      </div>
      
      <div className="mt-8 bg-blue-50 border-l-4 border-blue-500 p-6 rounded">
        <div className="flex items-start">
          <Info className="text-blue-500 mr-3 flex-shrink-0 mt-1" size={20} />
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">Quick Start Guide</h4>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• Select a tool from the cards above to begin</li>
              <li>• EPCIS Timestamp Validator: Validate chronological order of events</li>
              <li>• Network Diagnostics: Test connectivity and performance</li>
              <li>• Package Validator: Verify package compliance</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // EPCIS Timestamp Validator Component
  const EPCISAnalyzer = () => (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">EPCIS Timestamp Validator</h2>
        <p className="text-gray-600">Validates chronological order: Commission &lt; Aggregation &lt; Shipment</p>
      </div>
      
      {/* File Upload Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload EPCIS File</h3>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
          <input
            type="file"
            id="epcis-upload"
            accept=".xml,.json"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isProcessing}
          />
          <label htmlFor="epcis-upload" className="cursor-pointer">
            <Upload className="mx-auto text-gray-400 mb-3" size={48} />
            <p className="text-gray-700 font-medium mb-2">
              {isProcessing ? 'Processing...' : 'Click to upload or drag and drop'}
            </p>
            <p className="text-sm text-gray-500">EPCIS XML or JSON files</p>
          </label>
        </div>
        {uploadedFile && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center">
              <FileText className="text-blue-600 mr-3" size={24} />
              <div>
                <p className="font-medium text-gray-800">{uploadedFile.name}</p>
                <p className="text-sm text-gray-600">
                  {(uploadedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            {isProcessing && (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            )}
          </div>
        )}
      </div>

      {/* Validation Results */}
      {validationResult && (
        <>
          {/* Summary Card */}
          <div className={`rounded-lg shadow-md p-6 mb-6 ${
            validationResult.status === 'Successful' 
              ? 'bg-green-50 border-2 border-green-500' 
              : validationResult.status === 'Failed'
              ? 'bg-red-50 border-2 border-red-500'
              : 'bg-yellow-50 border-2 border-yellow-500'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                {validationResult.status === 'Successful' && (
                  <CheckCircle className="text-green-600 mr-4" size={48} />
                )}
                {validationResult.status === 'Failed' && (
                  <XCircle className="text-red-600 mr-4" size={48} />
                )}
                {validationResult.status === 'Error' && (
                  <AlertCircle className="text-yellow-600 mr-4" size={48} />
                )}
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">
                    Validation {validationResult.status}
                  </h2>
                  {validationResult.error && (
                    <p className="text-red-600 mt-1">{validationResult.error}</p>
                  )}
                </div>
              </div>
              
              {validationResult.status !== 'Error' && (
                <button
                  onClick={exportReport}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="mr-2" size={20} />
                  Export Report
                </button>
              )}
            </div>

            {validationResult.status !== 'Error' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 shadow">
                  <p className="text-sm text-gray-600 mb-1">Total Serials Validated</p>
                  <p className="text-3xl font-bold text-gray-800">
                    {validationResult.totalSerials}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <p className="text-sm text-gray-600 mb-1">Successful</p>
                  <p className="text-3xl font-bold text-green-600">
                    {validationResult.successCount}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <p className="text-sm text-gray-600 mb-1">Failed</p>
                  <p className="text-3xl font-bold text-red-600">
                    {validationResult.failureCount}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Failure Details */}
          {validationResult.failures && validationResult.failures.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-6">
                Failed Serial Numbers ({validationResult.failures.length})
              </h2>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {validationResult.failures.map((failure, index) => (
                  <div 
                    key={index}
                    className="border border-red-200 rounded-lg p-6 bg-red-50"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <XCircle className="text-red-600 mr-3 flex-shrink-0" size={24} />
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">
                            Serial Number: {failure.serialNumber}
                          </h3>
                          <p className="text-sm text-red-600 mt-1">{failure.reason}</p>
                        </div>
                      </div>
                      <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                        <div className="flex items-center mb-2">
                          <Clock className="text-blue-600 mr-2" size={18} />
                          <p className="text-sm font-semibold text-gray-600">Commission</p>
                        </div>
                        <p className="text-sm font-mono text-gray-800 break-all">
                          {failure.commissionTimestamp}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTimestamp(failure.commissionDate)}
                        </p>
                      </div>

                      <div className="bg-white rounded-lg p-4 border-l-4 border-purple-500">
                        <div className="flex items-center mb-2">
                          <Clock className="text-purple-600 mr-2" size={18} />
                          <p className="text-sm font-semibold text-gray-600">Aggregation</p>
                        </div>
                        <p className="text-sm font-mono text-gray-800 break-all">
                          {failure.aggregationTimestamp}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTimestamp(failure.aggregationDate)}
                        </p>
                      </div>

                      <div className="bg-white rounded-lg p-4 border-l-4 border-green-500">
                        <div className="flex items-center mb-2">
                          <Clock className="text-green-600 mr-2" size={18} />
                          <p className="text-sm font-semibold text-gray-600">Shipment</p>
                        </div>
                        <p className="text-sm font-mono text-gray-800 break-all">
                          {failure.shipmentTimestamp}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTimestamp(failure.shipmentDate)}
                        </p>
                      </div>
                    </div>

                    {/* Visual Timeline */}
                    <div className="mt-4 pt-4 border-t border-red-200">
                      <p className="text-xs text-gray-600 mb-2">Expected Timeline:</p>
                      <div className="flex items-center justify-between">
                        <div className="text-center">
                          <div className="w-3 h-3 bg-blue-500 rounded-full mx-auto mb-1"></div>
                          <p className="text-xs text-gray-600">Commission</p>
                        </div>
                        <div className="flex-1 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-2"></div>
                        <div className="text-center">
                          <div className="w-3 h-3 bg-purple-500 rounded-full mx-auto mb-1"></div>
                          <p className="text-xs text-gray-600">Aggregation</p>
                        </div>
                        <div className="flex-1 h-1 bg-gradient-to-r from-purple-500 to-green-500 mx-2"></div>
                        <div className="text-center">
                          <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-1"></div>
                          <p className="text-xs text-gray-600">Shipment</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Message */}
          {validationResult.status === 'Successful' && (
            <div className="bg-white rounded-lg shadow-md p-8">
              <div className="text-center">
                <CheckCircle className="text-green-600 mx-auto mb-4" size={64} />
                <h3 className="text-2xl font-bold text-gray-800 mb-2">
                  All Serial Numbers Validated Successfully!
                </h3>
                <p className="text-gray-600">
                  All {validationResult.totalSerials} serial numbers follow the correct chronological order.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Instructions */}
      {!validationResult && !isProcessing && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Validation Rules</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <Calendar className="text-blue-600 mr-3 flex-shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Chronological Order Check</h4>
                <p className="text-gray-600 text-sm">
                  Commission Timestamp &lt; Aggregation Timestamp &lt; Shipment Timestamp
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <AlertCircle className="text-yellow-600 mr-3 flex-shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Strict Inequality</h4>
                <p className="text-gray-600 text-sm">
                  Equal timestamps are not allowed. Each event must occur at a distinct time.
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Validation Result</h4>
                <p className="text-gray-600 text-sm">
                  File passes only if ALL serial numbers satisfy the chronological order requirement.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Network Diagnostics Component (Placeholder)
  const NetworkDiagnostics = () => (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Network Diagnostics</h2>
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-gray-600">Network diagnostics tools coming soon...</p>
        <div className="mt-4 space-y-2">
          <div className="p-4 bg-gray-50 rounded">
            <h4 className="font-semibold text-gray-800 mb-2">Planned Features:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Connectivity testing</li>
              <li>• Latency measurements</li>
              <li>• Endpoint validation</li>
              <li>• SSL certificate verification</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Package Validator Component (Placeholder)
  const PackageValidator = () => (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Package Validator</h2>
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-gray-600">Package validation tools coming soon...</p>
        <div className="mt-4 space-y-2">
          <div className="p-4 bg-gray-50 rounded">
            <h4 className="font-semibold text-gray-800 mb-2">Planned Features:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Package structure validation</li>
              <li>• Schema compliance checking</li>
              <li>• Barcode verification</li>
              <li>• Serialization validation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Render active component
  const renderActiveApp = () => {
    switch (activeApp) {
      case 'home':
        return <Dashboard />;
      case 'epcis':
        return <EPCISAnalyzer />;
      case 'network':
        return <NetworkDiagnostics />;
      case 'packages':
        return <PackageValidator />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-gray-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {sidebarOpen && <h1 className="text-xl font-bold">TraceLink</h1>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-700 rounded"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        <nav className="flex-1 p-4">
          {subApps.map(app => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => setActiveApp(app.id)}
                className={`w-full flex items-center p-3 mb-2 rounded transition-colors ${
                  activeApp === app.id
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-700 text-gray-300'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="ml-3">{app.name}</span>}
              </button>
            );
          })}
        </nav>
        
        {sidebarOpen && (
          <div className="p-4 border-t border-gray-700">
            <div className="text-xs text-gray-400">TraceLink Support Tools v1.0</div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {renderActiveApp()}
      </div>
    </div>
  );
};

export default TraceLinkSupportApp;
