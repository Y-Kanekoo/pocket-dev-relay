#!/bin/bash
set -euo pipefail

# ============================================================================
# pocket-dev-relay: 依存ツールインストールスクリプト
# Tailscale, mosh, tmux をOS に応じて自動インストールします
# 対応OS: Linux (Debian/Ubuntu), macOS (Homebrew)
# ============================================================================

# ---------------------------------------------------------------------------
# カラー出力の定義
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    RESET=''
fi

# ---------------------------------------------------------------------------
# ユーティリティ関数
# ---------------------------------------------------------------------------
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
header()  { echo -e "\n${BOLD}${CYAN}==> $*${RESET}"; }

# ---------------------------------------------------------------------------
# OS 検出
# ---------------------------------------------------------------------------
detect_os() {
    local uname_out
    uname_out="$(uname -s)"

    case "$uname_out" in
        Linux*)
            OS="linux"
            # ディストリビューション判定
            if [[ -f /etc/os-release ]]; then
                # shellcheck source=/dev/null
                . /etc/os-release
                DISTRO="${ID:-unknown}"
                DISTRO_LIKE="${ID_LIKE:-}"
            elif [[ -f /etc/debian_version ]]; then
                DISTRO="debian"
                DISTRO_LIKE="debian"
            else
                DISTRO="unknown"
                DISTRO_LIKE=""
            fi
            ;;
        Darwin*)
            OS="macos"
            DISTRO="macos"
            DISTRO_LIKE=""
            ;;
        *)
            error "未対応のOS: $uname_out"
            error "このスクリプトは Linux (Debian/Ubuntu) と macOS に対応しています"
            exit 1
            ;;
    esac
}

# Debian系ディストリビューションかどうか判定
is_debian_based() {
    [[ "$DISTRO" == "debian" || "$DISTRO" == "ubuntu" || "$DISTRO_LIKE" == *"debian"* || "$DISTRO_LIKE" == *"ubuntu"* ]]
}

# コマンドの存在チェック
command_exists() {
    command -v "$1" &>/dev/null
}

# ---------------------------------------------------------------------------
# インストール関数: Tailscale
# ---------------------------------------------------------------------------
install_tailscale() {
    header "Tailscale のインストール"

    if command_exists tailscale; then
        local ts_version
        ts_version="$(tailscale version 2>/dev/null | head -n1 || echo 'unknown')"
        success "Tailscale はインストール済みです (${ts_version})"
        RESULTS+=("Tailscale|installed|${ts_version}")
        return 0
    fi

    info "Tailscale をインストールしています..."

    if [[ "$OS" == "linux" ]]; then
        if is_debian_based; then
            curl -fsSL https://tailscale.com/install.sh | sh
        else
            error "Debian/Ubuntu 以外のLinuxディストリビューションでは自動インストールに対応していません"
            error "手動でインストールしてください: https://tailscale.com/download/linux"
            RESULTS+=("Tailscale|failed|未対応のディストリビューション: ${DISTRO}")
            return 1
        fi
    elif [[ "$OS" == "macos" ]]; then
        if command_exists brew; then
            brew install --cask tailscale
        else
            error "Homebrew がインストールされていません"
            error "先に Homebrew をインストールしてください: https://brew.sh"
            RESULTS+=("Tailscale|failed|Homebrew が必要です")
            return 1
        fi
    fi

    # インストール確認
    if command_exists tailscale; then
        local ts_version
        ts_version="$(tailscale version 2>/dev/null | head -n1 || echo 'unknown')"
        success "Tailscale のインストールが完了しました (${ts_version})"
        RESULTS+=("Tailscale|installed|${ts_version}")
    else
        error "Tailscale のインストールに失敗しました"
        RESULTS+=("Tailscale|failed|インストール失敗")
        return 1
    fi
}

# ---------------------------------------------------------------------------
# インストール関数: mosh
# ---------------------------------------------------------------------------
install_mosh() {
    header "mosh のインストール"

    if command_exists mosh-server; then
        local mosh_version
        mosh_version="$(mosh-server --version 2>&1 | head -n1 || echo 'unknown')"
        success "mosh はインストール済みです (${mosh_version})"
        RESULTS+=("mosh|installed|${mosh_version}")
        return 0
    fi

    info "mosh をインストールしています..."

    if [[ "$OS" == "linux" ]]; then
        if is_debian_based; then
            sudo apt-get update -qq
            sudo apt-get install -y -qq mosh
        else
            error "Debian/Ubuntu 以外のLinuxディストリビューションでは自動インストールに対応していません"
            error "手動でインストールしてください: https://mosh.org/#getting"
            RESULTS+=("mosh|failed|未対応のディストリビューション: ${DISTRO}")
            return 1
        fi
    elif [[ "$OS" == "macos" ]]; then
        if command_exists brew; then
            brew install mosh
        else
            error "Homebrew がインストールされていません"
            RESULTS+=("mosh|failed|Homebrew が必要です")
            return 1
        fi
    fi

    # インストール確認
    if command_exists mosh-server; then
        local mosh_version
        mosh_version="$(mosh-server --version 2>&1 | head -n1 || echo 'unknown')"
        success "mosh のインストールが完了しました (${mosh_version})"
        RESULTS+=("mosh|installed|${mosh_version}")
    else
        error "mosh のインストールに失敗しました"
        RESULTS+=("mosh|failed|インストール失敗")
        return 1
    fi
}

# ---------------------------------------------------------------------------
# インストール関数: tmux
# ---------------------------------------------------------------------------
install_tmux() {
    header "tmux のインストール"

    if command_exists tmux; then
        local tmux_version
        tmux_version="$(tmux -V 2>/dev/null || echo 'unknown')"
        success "tmux はインストール済みです (${tmux_version})"
        RESULTS+=("tmux|installed|${tmux_version}")
        return 0
    fi

    info "tmux をインストールしています..."

    if [[ "$OS" == "linux" ]]; then
        if is_debian_based; then
            sudo apt-get update -qq
            sudo apt-get install -y -qq tmux
        else
            error "Debian/Ubuntu 以外のLinuxディストリビューションでは自動インストールに対応していません"
            error "手動でインストールしてください: https://github.com/tmux/tmux/wiki/Installing"
            RESULTS+=("tmux|failed|未対応のディストリビューション: ${DISTRO}")
            return 1
        fi
    elif [[ "$OS" == "macos" ]]; then
        if command_exists brew; then
            brew install tmux
        else
            error "Homebrew がインストールされていません"
            RESULTS+=("tmux|failed|Homebrew が必要です")
            return 1
        fi
    fi

    # インストール確認
    if command_exists tmux; then
        local tmux_version
        tmux_version="$(tmux -V 2>/dev/null || echo 'unknown')"
        success "tmux のインストールが完了しました (${tmux_version})"
        RESULTS+=("tmux|installed|${tmux_version}")
    else
        error "tmux のインストールに失敗しました"
        RESULTS+=("tmux|failed|インストール失敗")
        return 1
    fi
}

# ---------------------------------------------------------------------------
# サマリー表示
# ---------------------------------------------------------------------------
print_summary() {
    header "インストール結果サマリー"
    echo ""

    local all_ok=true
    printf "  ${BOLD}%-14s %-12s %s${RESET}\n" "ツール" "ステータス" "詳細"
    echo "  ────────────────────────────────────────────────"

    for entry in "${RESULTS[@]}"; do
        IFS='|' read -r tool status detail <<< "$entry"

        if [[ "$status" == "installed" ]]; then
            printf "  %-14s ${GREEN}%-12s${RESET} %s\n" "$tool" "OK" "$detail"
        else
            printf "  %-14s ${RED}%-12s${RESET} %s\n" "$tool" "FAILED" "$detail"
            all_ok=false
        fi
    done

    echo ""

    if $all_ok; then
        success "全ての依存ツールが正常にインストールされています"
        echo ""
        info "次のステップ:"
        echo "  1. npm install && npm run build && npm link"
        echo "  2. pdr setup"
        echo "  3. pdr start"
    else
        warn "一部のツールのインストールに失敗しました"
        warn "上記のエラーメッセージを確認し、手動でインストールしてください"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------
main() {
    echo ""
    echo -e "${BOLD}${CYAN}pocket-dev-relay 依存ツールインストーラー${RESET}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

    # OS 検出
    detect_os
    info "検出されたOS: ${BOLD}${OS}${RESET} (${DISTRO})"

    if [[ "$OS" == "linux" ]] && ! is_debian_based; then
        warn "Debian/Ubuntu 以外のLinuxディストリビューションでは自動インストールが制限されます"
    fi

    # 結果を格納する配列
    declare -a RESULTS=()

    # 各ツールのインストール（失敗しても続行する）
    install_tailscale || true
    install_mosh      || true
    install_tmux      || true

    # サマリー表示
    print_summary
}

main "$@"
