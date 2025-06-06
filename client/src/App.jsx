import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import './App.css';

const socket = io('http://192.168.100.45:3001');

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('all');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [location, setLocation] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const getSafeUserName = (user) => {
    if (!user) return 'Usuario desconocido';
    if (user.name) return user.name;
    if (user.id) return `Usuario ${user.id.slice(0, 5)}`;
    return 'Usuario';
  };

  const getSafeUserAvatar = (user) => {
    const name = getSafeUserName(user);
    return name.charAt(0).toUpperCase();
  };

  useEffect(() => {
    socket.on('new_message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on('users_updated', (usersList) => {
      const safeUsers = (usersList || []).map(user => ({
        id: user?.id || Math.random().toString(36).substr(2, 9),
        name: user?.name,
        status: user?.status || 'online'
      }));
      setUsers(safeUsers);
    });

    socket.on('notification', (notification) => {
      setNotifications((prev) => [...prev, notification]);
      setTimeout(() => {
        setNotifications((prev) => prev.slice(1));
      }, 5000);
    });

    socket.on('user_typing', (userId) => {
      const user = users.find(u => u.id === userId);
      if (user) {
        setTypingUsers((prev) => [...new Set([...prev, getSafeUserName(user)])]);
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter(name => name !== getSafeUserName(user)));
        }, 2000);
      }
    });

    return () => {
      socket.off('new_message');
      socket.off('users_updated');
      socket.off('notification');
      socket.off('user_typing');
    };
  }, [users]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = () => {
    if (username.trim()) {
      setIsLoggedIn(true);
      socket.emit('set_username', username);
    }
  };

  const sendMessage = () => {
    if (message.trim() || file || location) {
      if (file) {
        uploadFile();
      } else if (location) {
        sendLocation();
      } else {
        socket.emit('send_message', {
          message,
          to: selectedUser,
          type: 'text'
        });
        setMessage('');
      }
    }
  };

  const uploadFile = async () => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://192.168.100.45:3001/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      socket.emit('send_message', {
        message: data.url,
        to: selectedUser,
        type: file.type.startsWith('image/') ? 'image' : 'file'
      });

      setFile(null);
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const sendLocation = () => {
    socket.emit('send_message', {
      message: JSON.stringify(location),
      to: selectedUser,
      type: 'location'
    });
    setLocation(null);
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    } else if (selectedUser !== 'all') {
      socket.emit('typing', selectedUser);
    }
  };

  const onEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const shareLocation = () => {
    if (navigator.geolocation) {
      setShowLocationModal(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.error("Error getting location:", error);
          setNotifications([...notifications, {
            from: 'Sistema',
            message: 'No se pudo obtener la ubicación'
          }]);
          setShowLocationModal(false);
        }
      );
    } else {
      setNotifications([...notifications, {
        from: 'Sistema',
        message: 'Geolocalización no soportada por tu navegador'
      }]);
    }
  };

  const renderMessageContent = (msg) => {
    switch (msg.type) {
      case 'image':
        return <img src={msg.message} alt="Imagen enviada" className="message-image" />;
      case 'file':
        return (
          <a href={msg.message} download className="file-message">
            <i className="file-icon"></i> Descargar archivo
          </a>
        );
      case 'location':
        try {
          const loc = JSON.parse(msg.message);
          return (
            <a 
              href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="location-message"
            >
              <i className="location-icon">📍</i> Ver ubicación en mapa
              <div className="location-coords">
                {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
              </div>
            </a>
          );
        } catch (e) {
          return "Ubicación compartida";
        }
      default:
        return msg.message;
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <img src="/logoA.jpg" alt="Logo AG Chat" className="login-logo" />
          <h1>AG Chat</h1>
          <input
            type="text"
            placeholder="Ingresa tu nombre"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin}>Entrar al chat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app">
      <div className="chat-header">
        <div className="chat-title">AG Chat</div>
        <div className="chat-status">Conectado como {username}</div>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <div className="current-user">
            <div className="user-avatar">{username.charAt(0).toUpperCase()}</div>
            <div className="user-name">{username}</div>
          </div>

          <div className="users-list">
            <div
              className={`user-item ${selectedUser === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedUser('all')}
            >
              <div className="user-avatar">👥</div>
              <span className={`user-status online`}></span> 
              <span className="user-name">Todos</span>
            </div>
            {users.map((user) => (
              <div
                key={user.id}
                className={`user-item ${selectedUser === user.id ? 'active' : ''}`}
                onClick={() => setSelectedUser(user.id)}
              >
                <div className="user-avatar">{getSafeUserAvatar(user)}</div>
                <span className={`user-status ${user.status || 'offline'}`}></span>
                <span className="user-name">{getSafeUserName(user)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="chat-main">
          <div className="messages">
            {messages
              .filter(
                (msg) =>
                  msg.to === 'all' ||
                  msg.from === socket.id ||
                  msg.to === socket.id ||
                  (msg.to === selectedUser && (msg.from === socket.id || msg.to === socket.id))
              )
              .map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.from === socket.id ? 'sent' : 'received'}`}
                >
                  <div className="message-content-wrapper">
                    {msg.type !== 'text' && (
                      <div className="message-from">{msg.fromName || 'Anon'}</div>
                    )}
                    <div className="message-content">
                      {renderMessageContent(msg)}
                    </div>
                    <div className="message-info">
                      <span className="message-time">
                        {msg.timestamp}
                      </span>
                      {msg.from === socket.id && (
                        <span className="message-status">
                          {msg.read ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="typing-indicator">
            {typingUsers.length > 0 && (
              <p>{typingUsers.join(', ')} está escribiendo...</p>
            )}
          </div>

          <div className="message-input-area">
            <div className="input-buttons">
              <button
                className="emoji-button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                😊
              </button>
              {showEmojiPicker && (
                <div className="emoji-picker-container">
                  <EmojiPicker onEmojiClick={onEmojiClick} />
                </div>
              )}

              <button
                className="location-button"
                onClick={shareLocation}
                title="Compartir ubicación"
              >
                📍
              </button>

              <input
                type="file"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <button
                className="attach-button"
                onClick={() => fileInputRef.current.click()}
              >
                📎
              </button>
            </div>

            <input
              type="text"
              placeholder="Escribe tu mensaje"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
            />

            <button className="send-button" onClick={sendMessage}>
              Enviar
            </button>
          </div>
        </div>
      </div>

      {showLocationModal && (
        <div className="location-modal">
          <div className="modal-content">
            <h3>Compartir Ubicación</h3>
            {location ? (
              <>
                <p>¿Compartir esta ubicación?</p>
                <div className="location-preview">
                  <a 
                    href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Ver en mapa
                  </a>
                  <div>Latitud: {location.lat.toFixed(6)}</div>
                  <div>Longitud: {location.lng.toFixed(6)}</div>
                  <div>Precisión: ~{Math.round(location.accuracy)} metros</div>
                </div>
                <div className="modal-buttons">
                  <button onClick={() => {
                    sendLocation();
                    setShowLocationModal(false);
                  }} className="confirm-button">
                    Compartir
                  </button>
                  <button onClick={() => {
                    setLocation(null);
                    setShowLocationModal(false);
                  }} className="cancel-button">
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="loading-location">
                <div className="spinner"></div>
                <p>Obteniendo ubicación...</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="notifications">
        {notifications.map((notif, idx) => (
          <div key={idx} className="notification">
            {notif.from}: {notif.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;