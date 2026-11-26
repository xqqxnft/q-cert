// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CertRegistry
/// @notice Stores the SHA-256 hash of a Q-Cert certificate together with the
///         account that issued it, so anyone can look a certificate up on the
///         QoreChain EVM and see whether its issuer has revoked it.
/// @dev    The certificate itself (title, recipient name) never goes on chain,
///         only its hash. No funds are held and no value is accepted.
contract CertRegistry {
    struct Record {
        address issuer;
        uint64 issuedAt;
        bool revoked;
    }

    mapping(bytes32 => Record) private records;

    event Issued(bytes32 indexed certHash, address indexed issuer);
    event Revoked(bytes32 indexed certHash, address indexed issuer);

    error AlreadyIssued(bytes32 certHash);
    error UnknownCertificate(bytes32 certHash);
    error NotIssuer(bytes32 certHash, address caller);
    error AlreadyRevoked(bytes32 certHash);
    error EmptyHash();

    /// @notice Record a certificate hash as issued by the caller.
    function issue(bytes32 certHash) external {
        if (certHash == bytes32(0)) revert EmptyHash();
        if (records[certHash].issuer != address(0)) revert AlreadyIssued(certHash);
        records[certHash] = Record({issuer: msg.sender, issuedAt: uint64(block.timestamp), revoked: false});
        emit Issued(certHash, msg.sender);
    }

    /// @notice Mark a certificate as revoked. Only its issuer can do this.
    function revoke(bytes32 certHash) external {
        Record storage r = records[certHash];
        if (r.issuer == address(0)) revert UnknownCertificate(certHash);
        if (r.issuer != msg.sender) revert NotIssuer(certHash, msg.sender);
        if (r.revoked) revert AlreadyRevoked(certHash);
        r.revoked = true;
        emit Revoked(certHash, msg.sender);
    }

    /// @notice Read a certificate record. `issuer` is the zero address when unknown.
    function statusOf(bytes32 certHash) external view returns (address issuer, uint64 issuedAt, bool revoked) {
        Record storage r = records[certHash];
        return (r.issuer, r.issuedAt, r.revoked);
    }
}
