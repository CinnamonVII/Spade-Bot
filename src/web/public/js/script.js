document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Stats Counter Animation
    const stats = document.querySelectorAll('.stat-number');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = +entry.target.getAttribute('data-target');
                const increment = target / 100;

                let current = 0;
                const updateCount = () => {
                    if (current < target) {
                        current += increment;
                        entry.target.innerText = Math.ceil(current);
                        setTimeout(updateCount, 20);
                    } else {
                        entry.target.innerText = target;
                    }
                };
                updateCount();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => {
        observer.observe(stat);
    });

    // Card Stack Hover Effect
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.zIndex = '10';
            card.style.transform = 'scale(1.1) translateY(-20px)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.zIndex = '';
            card.style.transform = '';
        });
    });
});
