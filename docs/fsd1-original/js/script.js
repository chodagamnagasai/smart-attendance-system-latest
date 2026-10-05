/**
 * Smart Attendance Frontend Logic
 */

// --- Toast Notification System ---
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Remove after animation completes (3 seconds)
    setTimeout(() => {
        toast.remove();
        if (container.childNodes.length === 0) {
            container.remove();
        }
    }, 3000);
}

// --- Session Verification and Routing ---
function checkAuth() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    return user;
}

// --- Dynamic Navbar ---
function renderNavbar() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    const user = checkAuth();
    let navHtml = `<a href="index.html">Home</a>
                   <a href="about.html">About</a>
                   <a href="features.html">Features</a>`;
                   
    if (user) {
        // User is logged in
        if (user.role === 'student') {
            navHtml += `<a href="student-dashboard.html">Dashboard</a>`;
        } else if (user.role === 'faculty') {
             navHtml += `<a href="faculty-dashboard.html">Dashboard</a>`;
        } else if (user.role === 'admin') {
             navHtml += `<a href="admin-dashboard.html">Dashboard</a>`;
        }
        navHtml += `<a href="#" onclick="logout(event)">Logout</a>`;
    } else {
         // User is logged out
         navHtml += `<a href="login-student.html">Student Login</a>
                     <a href="login-faculty.html">Faculty Login</a>
                     <a href="login-admin.html">Admin Login</a>`;
    }

    nav.innerHTML = navHtml;
    
    // Highlight active link
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const links = nav.querySelectorAll('a');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
}

// --- Global Handlers ---

function doLogin(role, defaultRedirect) {
    const inputs = document.querySelectorAll('input');
    let userId = "";
    if(inputs.length > 0) userId = inputs[0].value;
    
    if(!userId) {
        showToast("Please enter an ID to login.", "error");
        return;
    }

    const user = { id: userId, role: role };
    localStorage.setItem('currentUser', JSON.stringify(user));
    showToast(`Logged in successfully as ${role}`, 'success');
    
    setTimeout(() => {
        window.location.href = defaultRedirect;
    }, 1000);
}

function loginSuccess() {
    // This maintains backward compatibility with the old HTML button for student
    doLogin('student', 'student-dashboard.html');
}

function loginFaculty() {
    doLogin('faculty', 'faculty-dashboard.html');
}

function loginAdmin() {
     doLogin('admin', 'admin-dashboard.html');
}

function logout(event) {
    if(event) event.preventDefault();
    localStorage.removeItem('currentUser');
    showToast("Logged out successfully", 'info');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

function markAttendance() {
    showToast("Attendance Marked Successfully", "success");
}

function generateQR() {
    showToast("QR Code Generated! Valid for 5 minutes.", "success");
}

// Initialization on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    // Add fade-in animation to containers
    const containers = document.querySelectorAll('.container, .form-container');
    containers.forEach(el => el.classList.add('fade-in'));
    
    renderNavbar();
    
    // Protect dashboards (basic frontend mock security)
    const currentPath = window.location.pathname.split('/').pop() || '';
    if (currentPath.includes('dashboard')) {
        const user = checkAuth();
        if (!user) {
            alert('Please login to access the dashboard.'); // using alert because toast won't have time to render
            window.location.href = 'index.html';
        } else if (currentPath.includes('student') && user.role !== 'student') {
             window.location.href = 'index.html';
        } else if (currentPath.includes('faculty') && user.role !== 'faculty') {
             window.location.href = 'index.html';
        }
    }
});
