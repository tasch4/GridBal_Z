pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GridBal_Z is ZamaEthereumConfig {
    struct GridNode {
        string nodeId;
        euint32 encryptedLoad;
        uint256 capacity;
        uint256 lastUpdated;
        address operator;
        bool isActive;
    }

    struct GridBalance {
        euint32 totalEncryptedLoad;
        uint256 totalCapacity;
        uint256 lastCalculated;
    }

    mapping(string => GridNode) public gridNodes;
    mapping(uint256 => GridBalance) public gridBalances;
    string[] public nodeIds;
    uint256 public currentBalanceId;

    event NodeAdded(string indexed nodeId, address indexed operator);
    event NodeUpdated(string indexed nodeId, address indexed operator);
    event BalanceCalculated(uint256 indexed balanceId);

    constructor() ZamaEthereumConfig() {
        currentBalanceId = 0;
    }

    function addGridNode(
        string calldata nodeId,
        externalEuint32 encryptedLoad,
        bytes calldata inputProof,
        uint256 capacity
    ) external {
        require(bytes(gridNodes[nodeId].nodeId).length == 0, "Node already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedLoad, inputProof)), "Invalid encrypted input");

        gridNodes[nodeId] = GridNode({
            nodeId: nodeId,
            encryptedLoad: FHE.fromExternal(encryptedLoad, inputProof),
            capacity: capacity,
            lastUpdated: block.timestamp,
            operator: msg.sender,
            isActive: true
        });

        FHE.allowThis(gridNodes[nodeId].encryptedLoad);
        FHE.makePubliclyDecryptable(gridNodes[nodeId].encryptedLoad);

        nodeIds.push(nodeId);
        emit NodeAdded(nodeId, msg.sender);
    }

    function updateGridNode(
        string calldata nodeId,
        externalEuint32 encryptedLoad,
        bytes calldata inputProof,
        uint256 capacity
    ) external {
        require(bytes(gridNodes[nodeId].nodeId).length > 0, "Node does not exist");
        require(msg.sender == gridNodes[nodeId].operator, "Only operator can update");
        require(FHE.isInitialized(FHE.fromExternal(encryptedLoad, inputProof)), "Invalid encrypted input");

        gridNodes[nodeId].encryptedLoad = FHE.fromExternal(encryptedLoad, inputProof);
        gridNodes[nodeId].capacity = capacity;
        gridNodes[nodeId].lastUpdated = block.timestamp;

        FHE.allowThis(gridNodes[nodeId].encryptedLoad);
        FHE.makePubliclyDecryptable(gridNodes[nodeId].encryptedLoad);

        emit NodeUpdated(nodeId, msg.sender);
    }

    function calculateGridBalance() external {
        euint32 totalLoad = FHE.zero();
        uint256 totalCapacity = 0;

        for (uint256 i = 0; i < nodeIds.length; i++) {
            string storage nodeId = nodeIds[i];
            if (gridNodes[nodeId].isActive) {
                totalLoad = FHE.add(totalLoad, gridNodes[nodeId].encryptedLoad);
                totalCapacity += gridNodes[nodeId].capacity;
            }
        }

        currentBalanceId++;
        gridBalances[currentBalanceId] = GridBalance({
            totalEncryptedLoad: totalLoad,
            totalCapacity: totalCapacity,
            lastCalculated: block.timestamp
        });

        FHE.allowThis(gridBalances[currentBalanceId].totalEncryptedLoad);
        FHE.makePubliclyDecryptable(gridBalances[currentBalanceId].totalEncryptedLoad);

        emit BalanceCalculated(currentBalanceId);
    }

    function getGridNode(string calldata nodeId) external view returns (
        euint32 encryptedLoad,
        uint256 capacity,
        uint256 lastUpdated,
        address operator,
        bool isActive
    ) {
        require(bytes(gridNodes[nodeId].nodeId).length > 0, "Node does not exist");
        GridNode storage node = gridNodes[nodeId];
        return (node.encryptedLoad, node.capacity, node.lastUpdated, node.operator, node.isActive);
    }

    function getGridBalance(uint256 balanceId) external view returns (
        euint32 totalEncryptedLoad,
        uint256 totalCapacity,
        uint256 lastCalculated
    ) {
        require(balanceId > 0 && balanceId <= currentBalanceId, "Invalid balance ID");
        GridBalance storage balance = gridBalances[balanceId];
        return (balance.totalEncryptedLoad, balance.totalCapacity, balance.lastCalculated);
    }

    function getAllNodeIds() external view returns (string[] memory) {
        return nodeIds;
    }

    function getCurrentBalanceId() external view returns (uint256) {
        return currentBalanceId;
    }

    function setNodeActiveStatus(string calldata nodeId, bool isActive) external {
        require(bytes(gridNodes[nodeId].nodeId).length > 0, "Node does not exist");
        require(msg.sender == gridNodes[nodeId].operator, "Only operator can update status");
        gridNodes[nodeId].isActive = isActive;
    }
}

