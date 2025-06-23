document.addEventListener('DOMContentLoaded', function() {
    // Profile Form Submission
    const profileForm = document.querySelector('.profile-details');

    if (profileForm) {
        profileForm.addEventListener('submit', function(event) {
            event.preventDefault();

            const name = document.querySelector('#name').value;
            const surname = document.querySelector('#surname').value;
            const email = document.querySelector('#email').value;
            const number = document.querySelector('#number').value;

            if (!name || !surname || !email || !number) {
                alert('All fields are required.');
                return;
            }

            const formData = new FormData(profileForm);
            fetch('/api/profile', {
                method: 'PUT',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Profile updated successfully.');
                    document.querySelectorAll('.profile-details input').forEach(input => {
                        input.disabled = true;
                    });
                    document.getElementById('editProfileBtn').style.display = 'block';
                    document.getElementById('saveProfileBtn').style.display = 'none';
                } else {
                    alert('Error updating profile.');
                }
            })
            .catch(error => {
                console.error('Error updating profile:', error);
                alert('Error updating profile.');
            });
        });
    }

    // Function to get profile data
    async function getProfile() {
        try {
            const response = await fetch('/api/profile');
            const data = await response.json();

            if (response.ok) {
                document.getElementById('name').value = data.name;
                document.getElementById('surname').value = data.surname;
                document.getElementById('email').value = data.email;
                document.getElementById('number').value = data.number;
                if (data.avatar) {
                    document.getElementById('profileImage').src = data.avatar;
                }
                document.getElementById('usernameDisplay').textContent = data.login;
            } else {
                console.error('Failed to fetch profile:', data);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    }

    // Function to calculate remaining time
    function calculateRemainingTime(endTime) {
        const now = new Date();
        const end = new Date(endTime);
        const diff = end - now;
        if (diff <= 0) return 'Expired';
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${days}d ${hours}h ${minutes}m`;
    }

    // Function to get reservation history
    async function getHistory() {
        try {
            const response = await fetch('/api/reservations');
            const reservations = await response.json();
            const historyContainer = document.getElementById('history-container');
            historyContainer.innerHTML = '';

            reservations.forEach(reservation => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.id = `reservation-${reservation._id}`;
                const remainingTime = reservation.endTime ? calculateRemainingTime(reservation.endTime) : 'Not started';
                historyItem.innerHTML = `
                    <div class="history-car">
                        <img src="${reservation.car.image}" alt="Car Icon"> ${reservation.car.brand} ${reservation.car.model}
                    </div>
                    <div class="history-details">
                        <p>Дата бронирования: ${new Date(reservation.date).toLocaleDateString()}</p>
                        <p>Срок аренды: ${reservation.days} дней</p>
                        <p>Сумма: ${reservation.totalPrice}</p>
                        <p>Статус: ${reservation.status}</p>
                        <p class="remaining-time">Оставшееся время: ${remainingTime}</p>
                        ${reservation.status === 'pending' ? `<button onclick="scanQR(${reservation._id})">Scan QR</button>` : ''}
                        <div class="qr-code" id="qr-code-${reservation._id}"></div>
                    </div>
                `;
                historyContainer.appendChild(historyItem);
            });
        } catch (error) {
            console.error('Error fetching reservations:', error);
        }
    }

    // Function to scan QR code and start rental
window.scanQR = async function(reservationId) {
    try {
        const response = await fetch(`/api/reservations/${reservationId}/qrcode`);
        const data = await response.json();
        
        if (data.qrCode) {
            const qrContainer = document.getElementById(`qr-code-${reservationId}`);
            qrContainer.innerHTML = `
                <div class="qr-code-display">
                    <img src="${data.qrCode}" alt="QR Code">
                    <p>Scan this QR code to activate your reservation</p>
                    <button onclick="activateReservation(${reservationId})">Activate Now</button>
                </div>
            `;
        } else {
            alert('Error generating QR code.');
        }
    } catch (error) {
        console.error('Error scanning QR:', error);
        alert('Error scanning QR.');
    }
}

window.activateReservation = async function(reservationId) {
    try {
        const response = await fetch(`/api/reservations/${reservationId}/scan`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Reservation activated successfully!');
            getHistory(); // Refresh the history list
        } else {
            alert('Error activating reservation.');
        }
    } catch (error) {
        console.error('Error activating reservation:', error);
        alert('Error activating reservation.');
    }
}

    // Initialize map
    async function initMap() {
    const mapElement = document.createElement('div');
    mapElement.id = 'map';
    mapElement.style.height = '400px';
    mapElement.style.marginBottom = '20px';
    document.querySelector('.profile').insertAdjacentElement('afterend', mapElement);

    const map = L.map('map').setView([55.7558, 37.6173], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    try {
        const response = await fetch('/api/locations');
        const locations = await response.json();
        locations.forEach(location => {
            const marker = L.marker([location.latitude, location.longitude]).addTo(map);
            marker.bindPopup(`<b>${location.name}</b><br>Type: ${location.type}`);
        });
    } catch (error) {
        console.error('Error loading locations:', error);
    }
}

    // Call functions on page load
    getProfile();
    getHistory();
    initMap();

    // Edit and Save Profile Buttons
    const editProfileBtn = document.getElementById('editProfileBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    editProfileBtn.addEventListener('click', function() {
        document.querySelectorAll('.profile-details input').forEach(input => {
            input.disabled = false;
        });
        editProfileBtn.style.display = 'none';
        saveProfileBtn.style.display = 'block';
    });

    const logoutBtn = document.querySelector('.logout-btn');
    logoutBtn.addEventListener('click', async function() {
        try {
            const response = await fetch('/logout');
            if (response.ok) {
                window.location.href = '/login';
            } else {
                alert('Failed to logout');
            }
        } catch (error) {
            console.error('Error logging out:', error);
            alert('Error logging out.');
        }
    });

    // Avatar Modal Functionality
    const avatarModal = document.getElementById('avatarModal');
    const avatarInput = document.getElementById('avatarInput');
    const profileImage = document.getElementById('profileImage');
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const closeAvatarModal = document.getElementById('closeAvatarModal');
    const saveAvatarBtn = document.getElementById('saveAvatarBtn');
    const avatarOptions = document.getElementById('avatarOptions');

    profileImage.addEventListener('click', () => {
        avatarOptions.style.display = 'block';
    });

    document.addEventListener('click', (event) => {
        if (!avatarOptions.contains(event.target) && !profileImage.contains(event.target)) {
            avatarOptions.style.display = 'none';
        }
    });

    changeAvatarBtn.addEventListener('click', () => {
        avatarModal.style.display = 'block';
    });

    closeAvatarModal.addEventListener('click', () => {
        avatarModal.style.display = 'none';
    });

    const uploadAvatarForm = document.getElementById('uploadAvatarForm');
    uploadAvatarForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const formData = new FormData(uploadAvatarForm);
        fetch('/api/profile/avatar', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                profileImage.src = data.avatar;
                avatarModal.style.display = 'none';
            } else {
                alert('Error uploading avatar.');
            }
        })
        .catch(error => {
            console.error('Error uploading avatar:', error);
            alert('Error uploading avatar.');
        });
    });

    const resizeAvatarBtn = document.getElementById('resizeAvatarBtn');
    resizeAvatarBtn.addEventListener('click', () => {
        avatarModal.style.display = 'block';
    });

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const widthBox = document.getElementById('widthBox');
    const heightBox = document.getElementById('heightBox');
    const topBox = document.getElementById('topBox');
    const leftBox = document.getElementById('leftBox');
    const newImg = document.getElementById('newImg');

    let image = new Image();
    let dragging = false;
    let lastX, lastY;

    function drawImage() {
        const width = parseInt(widthBox.value, 10);
        const height = parseInt(heightBox.value, 10);
        const top = parseInt(topBox.value, 10);
        const left = parseInt(leftBox.value, 10);

        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);
    }

    avatarInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            image.src = e.target.result;
            image.onload = drawImage;
        }

        reader.readAsDataURL(file);
    });

    [widthBox, heightBox, topBox, leftBox].forEach(input => {
        input.addEventListener('input', drawImage);
    });

    saveAvatarBtn.addEventListener('click', function(event) {
        event.preventDefault();

        canvas.toBlob(blob => {
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.png');

            fetch('/api/profile/avatar', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    profileImage.src = data.avatar;
                    newImg.href = data.avatar;
                    avatarModal.style.display = 'none';
                } else {
                    alert('Error saving avatar.');
                }
            })
            .catch(error => {
                console.error('Error saving avatar:', error);
                alert('Error saving avatar.');
            });
        }, 'image/png');
    });

    canvas.addEventListener('mousedown', (event) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
    });

    canvas.addEventListener('mousemove', (event) => {
        if (dragging) {
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;

            leftBox.value = parseInt(leftBox.value, 10) + dx;
            topBox.value = parseInt(topBox.value, 10) + dy;

            lastX = event.clientX;
            lastY = event.clientY;

            drawImage();
        }
    });

    canvas.addEventListener('mouseup', () => {
        dragging = false;
    });

    canvas.addEventListener('mouseout', () => {
        dragging = false;
    });
});