// ============================================
// CONFIGURAÇÃO INICIAL
// ============================================

const API_KEY = 'AIzaSyAivynv6ZIBMwcdSx6W2VSBF13lADY5FWs'; // ✅ SUA CHAVE AQUI
const audio = document.getElementById('audioPlayer');
let currentVideoId = null;
let currentTitle = '';
let currentChannel = '';
let currentThumb = '';
let isPlaying = false;
let currentAudioUrl = null;

// ============================================
// MEDIA SESSION API - NOTIFICAÇÃO NA TELA BLOQUEADA
// ============================================

function updateMediaSession(title, artist, artwork, videoId) {
    if ('mediaSession' in navigator) {
        // Configurar metadados da notificação
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title.substring(0, 100),
            artist: artist,
            album: 'YouTube Music Player',
            artwork: [
                { src: artwork, sizes: '96x96', type: 'image/jpeg' },
                { src: artwork, sizes: '128x128', type: 'image/jpeg' },
                { src: artwork, sizes: '192x192', type: 'image/jpeg' },
                { src: artwork, sizes: '512x512', type: 'image/jpeg' }
            ]
        });

        // Configurar ações da tela bloqueada
        navigator.mediaSession.setActionHandler('play', () => {
            audio.play();
            isPlaying = true;
            updatePlayPauseButton();
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            audio.pause();
            isPlaying = false;
            updatePlayPauseButton();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            console.log('Track anterior');
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            console.log('Próxima track');
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.fastSeek && details.seekTime) {
                audio.currentTime = details.seekTime;
            }
        });
    }
}

// ============================================
// EXTRAIR AUDIO DO YOUTUBE (Múltiplas fontes)
// ============================================

async function getYouTubeAudioUrl(videoId) {
    // Tentativa 1: API do Piped (mais confiável)
    const pipedUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
    
    try {
        const response = await fetch(pipedUrl);
        const data = await response.json();
        
        if (data.audioStreams && data.audioStreams.length > 0) {
            // Pega o melhor formato de áudio (opus é melhor qualidade)
            const audioStream = data.audioStreams.find(s => s.encoding === 'opus') || data.audioStreams[0];
            if (audioStream && audioStream.url) {
                return audioStream.url;
            }
        }
        
        if (data.videoStreams) {
            const audioOnly = data.videoStreams.find(v => v.onlyAudio === true);
            if (audioOnly && audioOnly.url) {
                return audioOnly.url;
            }
        }
    } catch(e) {
        console.log('Piped falhou, tentando próximo...');
    }
    
    // Tentativa 2: API do Invidious
    const invidiousUrls = [
        `https://inv.riverside.rocks/api/v1/videos/${videoId}`,
        `https://invidious.privacydev.net/api/v1/videos/${videoId}`,
        `https://yewtu.be/api/v1/videos/${videoId}`
    ];
    
    for (const url of invidiousUrls) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.formatStreams) {
                const audioFormat = data.formatStreams.find(f => 
                    f.type && f.type.includes('audio') && (f.encoding === 'opus' || f.encoding === 'aac')
                );
                if (audioFormat && audioFormat.url) {
                    return audioFormat.url;
                }
            }
        } catch(e) {
            continue;
        }
    }
    
    // Fallback: converter para embed (funciona mas consome mais dados)
    // Última opção - pode não funcionar em alguns casos
    return null;
}

// ============================================
// REPRODUZIR MÚSICA
// ============================================

async function playMusic(videoId, title, channel, thumbnail) {
    if (!videoId) {
        showToast('❌ ID do vídeo inválido');
        return;
    }
    
    currentVideoId = videoId;
    currentTitle = title;
    currentChannel = channel;
    currentThumb = thumbnail;
    
    // Mostrar player
    const playerDiv = document.getElementById('player');
    playerDiv.classList.remove('hidden');
    document.getElementById('playerTitle').innerText = title.substring(0, 60);
    document.getElementById('playerChannel').innerText = channel;
    document.getElementById('playerThumb').src = thumbnail;
    
    // Atualizar notificação da tela bloqueada
    updateMediaSession(title, channel, thumbnail, videoId);
    
    // Carregar e tocar áudio
    showToast('🎵 Carregando música: ' + title.substring(0, 40) + '...');
    
    try {
        const audioUrl = await getYouTubeAudioUrl(videoId);
        
        if (!audioUrl) {
            showToast('❌ Não foi possível carregar esta música. Tente outra.');
            return;
        }
        
        currentAudioUrl = audioUrl;
        audio.src = audioUrl;
        audio.load();
        
        // Tenta tocar automaticamente
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                isPlaying = true;
                document.getElementById('playPauseBtn').innerHTML = '⏸️';
                showToast('🎶 Tocando agora: ' + title.substring(0, 40));
                
                // Configurar para background
                setupBackgroundPlayback();
            }).catch(error => {
                console.log('Auto-play bloqueado:', error);
                isPlaying = false;
                document.getElementById('playPauseBtn').innerHTML = '▶️';
                showToast('🔊 Clique em play para tocar');
            });
        }
        
    } catch (error) {
        console.error('Erro:', error);
        showToast('❌ Erro ao carregar música. Tente outra.');
    }
}

// ============================================
// CONFIGURAR REPRODUÇÃO EM SEGUNDO PLANO
// ============================================

function setupBackgroundPlayback() {
    // Prevenir que o navegador pause o áudio quando a tela desligar
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isPlaying) {
            // Garantir que continua tocando quando a tela está desligada
            audio.play().catch(e => console.log('Background play:', e));
            
            // Atualizar notificação
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
        }
    });
    
    // Bloquear o áudio de parar quando perde foco
    audio.addEventListener('pause', () => {
        if (document.hidden && isPlaying) {
            // Se a tela está desligada e estava tocando, tenta retomar
            setTimeout(() => {
                if (document.hidden && isPlaying) {
                    audio.play().catch(e => console.log('Retomando background'));
                }
            }, 100);
        }
    });
}

// ============================================
// PLAY/PAUSE
// ============================================

function togglePlayPause() {
    if (!currentVideoId) {
        showToast('🎵 Selecione uma música primeiro');
        return;
    }
    
    if (isPlaying) {
        audio.pause();
        isPlaying = false;
        document.getElementById('playPauseBtn').innerHTML = '▶️';
        
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    } else {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                isPlaying = true;
                document.getElementById('playPauseBtn').innerHTML = '⏸️';
                
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'playing';
                }
            }).catch(error => {
                showToast('❌ Não foi possível tocar. Tente novamente.');
            });
        }
    }
}

function updatePlayPauseButton() {
    const btn = document.getElementById('playPauseBtn');
    if (isPlaying) {
        btn.innerHTML = '⏸️';
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else {
        btn.innerHTML = '▶️';
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
}

// ============================================
// BUSCAR MÚSICAS NO YOUTUBE
// ============================================

async function searchYouTube(query) {
    if (!query.trim()) {
        showToast('🔍 Digite o nome de uma música ou artista');
        return;
    }
    
    const loading = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    
    loading.classList.remove('hidden');
    resultsDiv.innerHTML = '';
    
    // Se for link do YouTube, extrair ID
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = query.match(youtubeRegex);
    if (match) {
        const videoId = match[1];
        loading.classList.add('hidden');
        fetchVideoInfo(videoId);
        return;
    }
    
    // Buscar na API do YouTube
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        loading.classList.add('hidden');
        
        if (!data.items || data.items.length === 0) {
            resultsDiv.innerHTML = '<div class="loading">😢 Nenhum resultado encontrado</div>';
            return;
        }
        
        // Mostrar resultados
        data.items.forEach(item => {
            const videoId = item.id.videoId;
            const title = item.snippet.title;
            const channel = item.snippet.channelTitle;
            const thumbnail = item.snippet.thumbnails.medium.url;
            
            const musicDiv = document.createElement('div');
            musicDiv.className = 'music-item';
            musicDiv.onclick = () => playMusic(videoId, title, channel, thumbnail);
            musicDiv.innerHTML = `
                <img class="music-thumb" src="${thumbnail}" alt="Capa" onerror="this.src='https://via.placeholder.com/60/FF0000/white?text=YT'">
                <div class="music-info">
                    <div class="music-title">${escapeHtml(title.substring(0, 80))}</div>
                    <div class="music-channel">${escapeHtml(channel)}</div>
                </div>
                <button class="control-btn" style="font-size:1.5rem">▶️</button>
            `;
            resultsDiv.appendChild(musicDiv);
        });
        
    } catch (error) {
        loading.classList.add('hidden');
        resultsDiv.innerHTML = `<div class="loading">❌ Erro: ${error.message}<br><small>Verifique sua conexão ou chave de API</small></div>`;
        console.error('Erro na busca:', error);
    }
}

async function fetchVideoInfo(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`;
    
    showToast('📹 Carregando vídeo...');
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items && data.items[0]) {
            const video = data.items[0];
            const title = video.snippet.title;
            const channel = video.snippet.channelTitle;
            const thumbnail = video.snippet.thumbnails.medium.url;
            
            playMusic(videoId, title, channel, thumbnail);
        } else {
            showToast('❌ Vídeo não encontrado');
        }
    } catch (error) {
        console.error('Erro:', error);
        showToast('❌ Erro ao carregar vídeo');
    }
}

// ============================================
// UTILITÁRIOS
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    // Remove toast anterior se existir
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    toast.style.animation = 'fadeInOut 2.5s ease forwards';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.remove) toast.remove();
    }, 2500);
}

// ============================================
// EVENTOS E PWA
// ============================================

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        console.log('✅ Service Worker registrado!');
    }).catch(err => {
        console.log('❌ Service Worker:', err);
    });
}

// Eventos da UI
document.getElementById('searchBtn').onclick = () => searchYouTube(document.getElementById('searchInput').value);
document.getElementById('searchInput').onkeypress = (e) => {
    if (e.key === 'Enter') searchYouTube(e.target.value);
};
document.getElementById('playPauseBtn').onclick = togglePlayPause;
document.getElementById('closePlayerBtn').onclick = () => {
    audio.pause();
    audio.src = '';
    currentVideoId = null;
    currentAudioUrl = null;
    isPlaying = false;
    document.getElementById('player').classList.add('hidden');
    
    // Limpar notificação
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
    }
};

// Atualizar estado do player
audio.addEventListener('play', () => {
    isPlaying = true;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

audio.addEventListener('pause', () => {
    isPlaying = false;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

audio.addEventListener('ended', () => {
    isPlaying = false;
    document.getElementById('playPauseBtn').innerHTML = '▶️';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

console.log('🎵 App pronto! Sua API key está configurada: ' + API_KEY.substring(0, 10) + '...');
