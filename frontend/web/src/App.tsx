import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface EnergyGridData {
  id: number;
  name: string;
  loadValue: string;
  capacity: string;
  status: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface GridAnalysis {
  balanceScore: number;
  efficiency: number;
  stability: number;
  riskLevel: number;
  optimization: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [gridData, setGridData] = useState<EnergyGridData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingData, setCreatingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newGridData, setNewGridData] = useState({ name: "", loadValue: "", capacity: "" });
  const [selectedGrid, setSelectedGrid] = useState<EnergyGridData | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ loadValue: number | null; capacity: number | null }>({ loadValue: null, capacity: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [realTimeData, setRealTimeData] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      setRealTimeData(prev => [...prev.slice(-19), Math.floor(Math.random() * 1000) + 500]);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const gridList: EnergyGridData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          gridList.push({
            id: parseInt(businessId.replace('grid-', '')) || Date.now(),
            name: businessData.name,
            loadValue: businessId,
            capacity: businessId,
            status: "Active",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setGridData(gridList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createGridData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating grid data with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const loadValue = parseInt(newGridData.loadValue) || 0;
      const businessId = `grid-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, loadValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newGridData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newGridData.capacity) || 0,
        0,
        "Energy Grid Load Data"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Grid data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewGridData({ name: "", loadValue: "", capacity: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingData(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const analyzeGrid = (grid: EnergyGridData, decryptedLoad: number | null, decryptedCapacity: number | null): GridAnalysis => {
    const load = grid.isVerified ? (grid.decryptedValue || 0) : (decryptedLoad || grid.publicValue1 || 500);
    const capacity = grid.publicValue1 || 1000;
    
    const balanceScore = Math.min(100, Math.round((load / capacity) * 100));
    const efficiency = Math.min(95, Math.round((load * 100) / capacity));
    const stability = Math.max(60, 100 - Math.abs(load - capacity/2) / capacity * 100);
    const riskLevel = load > capacity * 0.9 ? 85 : load > capacity * 0.7 ? 60 : 30;
    const optimization = Math.min(90, Math.round((capacity - load) / capacity * 100));

    return {
      balanceScore,
      efficiency,
      stability,
      riskLevel,
      optimization
    };
  };

  const renderStatistics = () => {
    const totalGrids = gridData.length;
    const verifiedGrids = gridData.filter(g => g.isVerified).length;
    const avgCapacity = gridData.length > 0 
      ? gridData.reduce((sum, g) => sum + g.publicValue1, 0) / gridData.length 
      : 0;
    
    const activeGrids = gridData.filter(g => g.status === "Active").length;

    return (
      <div className="statistics-panels">
        <div className="stat-panel copper-panel">
          <h3>Total Grids</h3>
          <div className="stat-number">{totalGrids}</div>
          <div className="stat-detail">{activeGrids} Active</div>
        </div>
        
        <div className="stat-panel copper-panel">
          <h3>Verified Data</h3>
          <div className="stat-number">{verifiedGrids}/{totalGrids}</div>
          <div className="stat-detail">FHE Protected</div>
        </div>
        
        <div className="stat-panel copper-panel">
          <h3>Avg Capacity</h3>
          <div className="stat-number">{avgCapacity.toFixed(0)}MW</div>
          <div className="stat-detail">Encrypted</div>
        </div>
      </div>
    );
  };

  const renderSmartChart = (grid: EnergyGridData, decryptedLoad: number | null, decryptedCapacity: number | null) => {
    const analysis = analyzeGrid(grid, decryptedLoad, decryptedCapacity);
    
    return (
      <div className="smart-chart">
        <div className="chart-metric">
          <div className="metric-label">Load Balance</div>
          <div className="metric-gauge">
            <div 
              className="gauge-fill" 
              style={{ width: `${analysis.balanceScore}%` }}
            >
              <span className="gauge-value">{analysis.balanceScore}%</span>
            </div>
          </div>
        </div>
        <div className="chart-metric">
          <div className="metric-label">Efficiency</div>
          <div className="metric-gauge">
            <div 
              className="gauge-fill efficiency" 
              style={{ width: `${analysis.efficiency}%` }}
            >
              <span className="gauge-value">{analysis.efficiency}%</span>
            </div>
          </div>
        </div>
        <div className="chart-metric">
          <div className="metric-label">Grid Stability</div>
          <div className="metric-gauge">
            <div 
              className="gauge-fill stability" 
              style={{ width: `${analysis.stability}%` }}
            >
              <span className="gauge-value">{analysis.stability}%</span>
            </div>
          </div>
        </div>
        <div className="chart-metric">
          <div className="metric-label">Risk Level</div>
          <div className="metric-gauge">
            <div 
              className="gauge-fill risk" 
              style={{ width: `${analysis.riskLevel}%` }}
            >
              <span className="gauge-value">{analysis.riskLevel}%</span>
            </div>
          </div>
        </div>
        <div className="chart-metric">
          <div className="metric-label">Optimization</div>
          <div className="metric-gauge">
            <div 
              className="gauge-fill optimization" 
              style={{ width: `${analysis.optimization}%` }}
            >
              <span className="gauge-value">{analysis.optimization}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRealTimeDashboard = () => {
    return (
      <div className="realtime-dashboard">
        <h3>Real-time Grid Monitoring</h3>
        <div className="realtime-chart">
          {realTimeData.map((value, index) => (
            <div 
              key={index} 
              className="data-bar"
              style={{ height: `${value / 15}%` }}
              title={`${value} MW`}
            ></div>
          ))}
        </div>
        <div className="realtime-stats">
          <div className="realtime-stat">
            <span>Current Load:</span>
            <strong>{realTimeData[realTimeData.length - 1] || 0} MW</strong>
          </div>
          <div className="realtime-stat">
            <span>Status:</span>
            <strong className="status-active">Stable</strong>
          </div>
        </div>
      </div>
    );
  };

  const filteredGridData = gridData.filter(grid => 
    grid.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grid.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <div className="logo-icon">⚡</div>
            <h1>Private Energy Grid</h1>
          </div>
          <div className="header-controls">
            <div className="wallet-connect">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="prompt-icon">🔐</div>
            <h2>Connect Wallet to Access Encrypted Grid</h2>
            <p>Secure energy grid management with fully homomorphic encryption</p>
            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon">🔒</span>
                <p>Encrypted load data storage</p>
              </div>
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <p>Homomorphic scheduling</p>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🌐</span>
                <p>Private grid balancing</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="gear-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing grid communications</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="gear-spinner"></div>
      <p>Loading encrypted grid system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">⚡</div>
          <div className="logo-text">
            <h1>Private Energy Grid</h1>
            <span className="logo-subtitle">FHE Encrypted Balancing</span>
          </div>
        </div>
        
        <div className="header-controls">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="primary-btn industrial-btn"
          >
            + Add Grid Data
          </button>
          <div className="wallet-connect">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <main className="main-content">
        <div className="content-panel">
          <div className="panel-header">
            <h2>Grid Statistics Overview</h2>
            <button 
              onClick={loadData} 
              className="refresh-btn industrial-btn"
              disabled={isRefreshing}
            >
              {isRefreshing ? "🔄" : "Refresh"}
            </button>
          </div>
          {renderStatistics()}
        </div>

        <div className="content-panel">
          <div className="panel-header">
            <h2>Real-time Grid Dashboard</h2>
            <span className="status-indicator">Live</span>
          </div>
          {renderRealTimeDashboard()}
        </div>

        <div className="content-panel">
          <div className="panel-header">
            <h2>Energy Grid Data</h2>
            <div className="panel-actions">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search grids..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
          </div>
          
          <div className="grid-list">
            {filteredGridData.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⚡</div>
                <p>No grid data found</p>
                <button 
                  className="primary-btn industrial-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Grid
                </button>
              </div>
            ) : filteredGridData.map((grid, index) => (
              <div 
                className={`grid-item ${selectedGrid?.id === grid.id ? "selected" : ""}`}
                key={index}
                onClick={() => setSelectedGrid(grid)}
              >
                <div className="grid-header">
                  <h3>{grid.name}</h3>
                  <span className={`status-badge ${grid.status.toLowerCase()}`}>
                    {grid.status}
                  </span>
                </div>
                <div className="grid-details">
                  <div className="detail-item">
                    <span>Capacity:</span>
                    <strong>{grid.publicValue1} MW</strong>
                  </div>
                  <div className="detail-item">
                    <span>Load:</span>
                    <strong>{grid.isVerified ? `${grid.decryptedValue} MW` : "🔒 Encrypted"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Created:</span>
                    <span>{new Date(grid.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="grid-footer">
                  <span className="creator">By: {grid.creator.substring(0, 8)}...</span>
                  {grid.isVerified && <span className="verified-tag">✅ Verified</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      
      {showCreateModal && (
        <CreateGridModal 
          onSubmit={createGridData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingData} 
          gridData={newGridData} 
          setGridData={setNewGridData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedGrid && (
        <GridDetailModal 
          grid={selectedGrid} 
          onClose={() => { 
            setSelectedGrid(null); 
            setDecryptedData({ loadValue: null, capacity: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedGrid.loadValue)}
          renderSmartChart={renderSmartChart}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateGridModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  gridData: any;
  setGridData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, gridData, setGridData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'loadValue') {
      const intValue = value.replace(/[^\d]/g, '');
      setGridData({ ...gridData, [name]: intValue });
    } else {
      setGridData({ ...gridData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-modal">
        <div className="modal-header">
          <h2>Add Grid Data</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="encryption-notice">
            <div className="notice-icon">🔐</div>
            <div>
              <strong>FHE Encryption Active</strong>
              <p>Load values encrypted with Zama FHE (Integer only)</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Grid Name *</label>
            <input 
              type="text" 
              name="name" 
              value={gridData.name} 
              onChange={handleChange} 
              placeholder="Enter grid name..." 
              className="industrial-input"
            />
          </div>
          
          <div className="form-group">
            <label>Load Value (MW) *</label>
            <input 
              type="number" 
              name="loadValue" 
              value={gridData.loadValue} 
              onChange={handleChange} 
              placeholder="Enter load value..." 
              step="1"
              min="0"
              className="industrial-input"
            />
            <div className="input-hint">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Capacity (MW) *</label>
            <input 
              type="number" 
              min="1" 
              name="capacity" 
              value={gridData.capacity} 
              onChange={handleChange} 
              placeholder="Enter capacity..." 
              className="industrial-input"
            />
            <div className="input-hint">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="secondary-btn industrial-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !gridData.name || !gridData.loadValue || !gridData.capacity} 
            className="primary-btn industrial-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Grid Data"}
          </button>
        </div>
      </div>
    </div>
  );
};

const GridDetailModal: React.FC<{
  grid: EnergyGridData;
  onClose: () => void;
  decryptedData: { loadValue: number | null; capacity: number | null };
  setDecryptedData: (value: { loadValue: number | null; capacity: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  renderSmartChart: (grid: EnergyGridData, decryptedLoad: number | null, decryptedCapacity: number | null) => JSX.Element;
}> = ({ grid, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData, renderSmartChart }) => {
  const handleDecrypt = async () => {
    if (decryptedData.loadValue !== null) { 
      setDecryptedData({ loadValue: null, capacity: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ loadValue: decrypted, capacity: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal industrial-modal">
        <div className="modal-header">
          <h2>Grid Details</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="grid-info">
            <div className="info-row">
              <span>Grid Name:</span>
              <strong>{grid.name}</strong>
            </div>
            <div className="info-row">
              <span>Creator:</span>
              <strong>{grid.creator.substring(0, 8)}...{grid.creator.substring(38)}</strong>
            </div>
            <div className="info-row">
              <span>Created:</span>
              <strong>{new Date(grid.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-row">
              <span>Capacity:</span>
              <strong>{grid.publicValue1} MW</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Load Data</h3>
            
            <div className="data-display">
              <div className="data-value">
                {grid.isVerified && grid.decryptedValue ? 
                  `${grid.decryptedValue} MW (Verified)` : 
                  decryptedData.loadValue !== null ? 
                  `${decryptedData.loadValue} MW (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn industrial-btn ${(grid.isVerified || decryptedData.loadValue !== null) ? 'verified' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : grid.isVerified ? "✅ Verified" : decryptedData.loadValue !== null ? "🔄 Re-verify" : "🔓 Decrypt"}
              </button>
            </div>
            
            <div className="encryption-info">
              <div className="info-icon">🔐</div>
              <div>
                <strong>FHE Self-Relaying Decryption</strong>
                <p>Load data encrypted on-chain. Click to verify using FHE.checkSignatures.</p>
              </div>
            </div>
          </div>
          
          {(grid.isVerified || decryptedData.loadValue !== null) && (
            <div className="analysis-section">
              <h3>Grid Performance Analysis</h3>
              {renderSmartChart(
                grid, 
                grid.isVerified ? grid.decryptedValue || null : decryptedData.loadValue, 
                null
              )}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="secondary-btn industrial-btn">Close</button>
          {!grid.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="primary-btn industrial-btn"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

