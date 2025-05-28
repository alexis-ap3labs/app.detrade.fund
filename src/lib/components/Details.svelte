<script lang="ts">
  import { ALL_VAULTS } from '$lib/vaults';
  
  export let vaultId: string;

  const vault = ALL_VAULTS.find(vault => vault.id === vaultId);
  const deploymentDate = vault?.created_at || "N/A";
  const administrator = vault?.administrator || '';
  const safeContract = vault?.safeContract || '';
  const priceOracle = vault?.priceOracle || '';

  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function getExplorerUrl(address: string): string {
    return `https://basescan.org/address/${address}`;
  }
</script>

<div class="details-outer">
  <div class="header">
    <div class="title-info">
      <h4 class="title-label">Details</h4>
    </div>
  </div>
  <div class="details-grid">
    <div class="detail-box">
      <div class="detail-label">Vault Deployment Date</div>
      <div class="detail-value">
        {deploymentDate}
      </div>
    </div>
    <div class="detail-box">
      <div class="detail-label">Administrator</div>
      <div class="detail-value">
        <a href={getExplorerUrl(administrator)} target="_blank" rel="noopener noreferrer" class="detail-link">
          {formatAddress(administrator)}
          <svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
    <div class="detail-box">
      <div class="detail-label">Safe</div>
      <div class="detail-value">
        <a href={getExplorerUrl(safeContract)} target="_blank" rel="noopener noreferrer" class="detail-link">
          {formatAddress(safeContract)}
          <svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
    <div class="detail-box">
      <div class="detail-label">Price Oracle</div>
      <div class="detail-value">
        <a href={getExplorerUrl(priceOracle)} target="_blank" rel="noopener noreferrer" class="detail-link">
          {formatAddress(priceOracle)}
          <svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  </div>
</div>

<style>
.details-outer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.title-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.02em;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-gap: 1rem;
  width: 100%;
}

.detail-box {
  background: rgba(10, 34, 58, 0.503);
  border-radius: 0.75rem;
  box-shadow: 0 0 0 rgba(25, 62, 182, 0.264);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.detail-label {
  color: rgba(255,255,255,0.5);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: inherit;
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.detail-link:hover {
  opacity: 0.8;
}

.external-link-icon {
  width: 1rem;
  height: 1rem;
  opacity: 0.7;
}

@media (max-width: 900px) {
  .details-grid {
    grid-template-columns: 1fr;
  }
  .detail-box {
    padding: 1.2rem 1rem;
    align-items: center;
    text-align: center;
  }
  .detail-label {
    text-align: center;
    width: 100%;
  }
  .detail-value {
    text-align: center;
    width: 100%;
  }
  .detail-link {
    justify-content: center;
  }
  .header {
    justify-content: center;
  }
  .title-label {
    text-align: center;
    width: 100%;
  }
}
</style> 