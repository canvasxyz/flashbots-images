#!/bin/bash
set -euo pipefail

log() { echo "[metadata-client] $*" >&2; }

fetch_gcp_attr() {
  local key="$1"
  local val=""
  # Try instance attribute first, then project attribute
  if val=$(curl -fsS --max-time 2 -H 'Metadata-Flavor: Google' "http://169.254.169.254/computeMetadata/v1/instance/attributes/${key}" 2>/dev/null); then
    :
  else
    val=""
  fi
  if [ -z "${val}" ]; then
    if val=$(curl -fsS --max-time 2 -H 'Metadata-Flavor: Google' "http://169.254.169.254/computeMetadata/v1/project/attributes/${key}" 2>/dev/null); then
      :
    else
      val=""
    fi
  fi
  printf '%s' "${val}"
}

fetch_azure_tag() {
  local key="$1"
  local tags
  tags=$(curl -fsS --max-time 2 -H 'Metadata: true' "http://169.254.169.254/metadata/instance/compute/tags?api-version=2021-02-01&format=text" 2>/dev/null || true)
  if [ -n "${tags}" ]; then
    # tags are in format: key1=value1;key2=value2; ...
    printf '%s' "$tags" | tr ';' '\n' | sed -n "s/^${key}[[:space:]]*=[[:space:]]*//p" | head -n1
    return 0
  fi
  # Fallback to tagsList JSON if needed
  local json
  json=$(curl -fsS --max-time 2 -H 'Metadata: true' "http://169.254.169.254/metadata/instance/compute/tagsList?api-version=2021-02-01" 2>/dev/null || true)
  if [ -n "${json}" ]; then
    # Very simple JSON extraction without jq
    # Look for {"name":"KEY","value":"..."}
    echo "$json" | tr ',' '\n' | sed -n "s/.*\"name\"\s*:\s*\"${key}\".*\"value\"\s*:\s*\"\(.*\)\".*/\1/p" | head -n1
  fi
}

write_message() {
  local message="$1"
  mkdir -p /run/metadata
  if [ -n "$message" ]; then
    printf '%s' "$message" > /run/metadata/message
  else
    # Ensure file exists with empty content
    : > /run/metadata/message
  fi
  chmod 0644 /run/metadata/message
}

setup_sshd_with_password() {
  local root_pw="$1"
  if [ -z "$root_pw" ]; then
    return 0
  fi
  log "Configuring sshd for root password login"
  # Unmask if masked by base debloat
  systemctl unmask ssh.service 2>/dev/null || true
  systemctl unmask sshd.service 2>/dev/null || true
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/10-root-login.conf << 'EOF'
# Allow root login with password when explicitly configured by metadata
PermitRootLogin yes
PasswordAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
EOF
  # Set the root password
  echo "root:${root_pw}" | chpasswd
  # Start (and enable) sshd
  if systemctl list-unit-files | grep -q '^ssh\.service'; then
    systemctl enable --now ssh.service || true
  else
    # Some distros use sshd.service
    systemctl enable --now sshd.service || true
  fi
}

main() {
  umask 022
  local msg="" root_pw=""

  # Try GCP first
  msg=$(fetch_gcp_attr MESSAGE || true)
  root_pw=$(fetch_gcp_attr ROOT_PW || true)

  # If both empty, try Azure
  if [ -z "$msg" ] && [ -z "$root_pw" ]; then
    msg=$(fetch_azure_tag MESSAGE || true)
    root_pw=$(fetch_azure_tag ROOT_PW || true)
  else
    # If partially filled, still try Azure to fill the other
    if [ -z "$msg" ]; then
      msg=$(fetch_azure_tag MESSAGE || true)
    fi
    if [ -z "$root_pw" ]; then
      root_pw=$(fetch_azure_tag ROOT_PW || true)
    fi
  fi

  write_message "$msg"
  setup_sshd_with_password "$root_pw"

  log "Done (message length: ${#msg}, root_pw set: $([ -n "$root_pw" ] && echo yes || echo no))"
}

main "$@"
