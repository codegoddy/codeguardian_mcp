"""
Seed data for system-provided project templates.
These templates are available to all users and provide starting points for common project types.
"""

SYSTEM_TEMPLATES = [
    {
        "name": "Web Application Development",
        "description": "Full-stack web application with frontend, backend, and database",
        "category": "web_app",
        "template_type": "code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 75.00,
            "default_change_request_rate": 100.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Project Setup & Planning",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Project architecture design",
                            "description": "Design system architecture, tech stack, and database schema",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Architecture diagram, tech stack documentation, and database schema approved",
                        },
                        {
                            "title": "Development environment setup",
                            "description": "Set up development environment, CI/CD pipeline, and deployment infrastructure",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Development environment running, CI/CD pipeline configured, deployment successful",
                        },
                    ],
                },
                {
                    "name": "Backend Development",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Database models and migrations",
                            "description": "Create database models, relationships, and initial migrations",
                            "estimated_hours": 10,
                            "acceptance_criteria": "All models created, migrations run successfully, relationships tested",
                        },
                        {
                            "title": "API endpoints implementation",
                            "description": "Implement RESTful API endpoints with authentication and authorization",
                            "estimated_hours": 20,
                            "acceptance_criteria": "All API endpoints functional, authenticated, and documented",
                        },
                        {
                            "title": "Business logic and services",
                            "description": "Implement core business logic and service layer",
                            "estimated_hours": 16,
                            "acceptance_criteria": "Business logic implemented, services tested, error handling in place",
                        },
                    ],
                },
                {
                    "name": "Frontend Development",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "UI component library",
                            "description": "Create reusable UI components and design system",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Component library created, documented, and responsive",
                        },
                        {
                            "title": "User interface implementation",
                            "description": "Build all user-facing pages and features",
                            "estimated_hours": 24,
                            "acceptance_criteria": "All pages implemented, responsive, and accessible",
                        },
                        {
                            "title": "API integration",
                            "description": "Connect frontend to backend API with state management",
                            "estimated_hours": 14,
                            "acceptance_criteria": "All API calls working, state management implemented, error handling in place",
                        },
                    ],
                },
                {
                    "name": "Testing & Deployment",
                    "order": 4,
                    "deliverables": [
                        {
                            "title": "Testing and bug fixes",
                            "description": "Comprehensive testing and bug resolution",
                            "estimated_hours": 16,
                            "acceptance_criteria": "All critical bugs fixed, application tested across browsers and devices",
                        },
                        {
                            "title": "Production deployment",
                            "description": "Deploy application to production environment",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Application deployed, SSL configured, monitoring in place",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Mobile App Development",
        "description": "Native or cross-platform mobile application for iOS and Android",
        "category": "mobile_app",
        "template_type": "code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 80.00,
            "default_change_request_rate": 110.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Planning & Design",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "App architecture and tech stack",
                            "description": "Define mobile architecture, choose tech stack (React Native/Flutter/Native)",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Architecture documented, tech stack approved, development plan created",
                        },
                        {
                            "title": "UI/UX design and prototypes",
                            "description": "Create wireframes, mockups, and interactive prototypes",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Designs approved, prototypes interactive, design system documented",
                        },
                    ],
                },
                {
                    "name": "Core Features Development",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Authentication and user management",
                            "description": "Implement user registration, login, and profile management",
                            "estimated_hours": 14,
                            "acceptance_criteria": "Authentication working, user profiles functional, secure token management",
                        },
                        {
                            "title": "Main app features",
                            "description": "Implement core application features and functionality",
                            "estimated_hours": 30,
                            "acceptance_criteria": "All core features implemented, tested on both iOS and Android",
                        },
                        {
                            "title": "API integration and data sync",
                            "description": "Connect to backend API and implement offline data sync",
                            "estimated_hours": 16,
                            "acceptance_criteria": "API integration complete, offline mode working, data sync reliable",
                        },
                    ],
                },
                {
                    "name": "Polish & Testing",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "UI polish and animations",
                            "description": "Add animations, transitions, and polish user interface",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Smooth animations, polished UI, consistent design",
                        },
                        {
                            "title": "Testing and bug fixes",
                            "description": "Test on multiple devices, fix bugs, optimize performance",
                            "estimated_hours": 14,
                            "acceptance_criteria": "App tested on various devices, bugs fixed, performance optimized",
                        },
                    ],
                },
                {
                    "name": "App Store Deployment",
                    "order": 4,
                    "deliverables": [
                        {
                            "title": "App store preparation",
                            "description": "Prepare app store listings, screenshots, and metadata",
                            "estimated_hours": 6,
                            "acceptance_criteria": "App store listings complete, screenshots ready, metadata approved",
                        },
                        {
                            "title": "App store submission",
                            "description": "Submit app to Apple App Store and Google Play Store",
                            "estimated_hours": 4,
                            "acceptance_criteria": "App submitted to both stores, review process initiated",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "REST API Development",
        "description": "Backend API service with authentication, database, and documentation",
        "category": "api",
        "template_type": "code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 70.00,
            "default_change_request_rate": 95.00,
            "max_revisions": 2,
            "milestones": [
                {
                    "name": "API Foundation",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "API architecture and design",
                            "description": "Design API structure, endpoints, and data models",
                            "estimated_hours": 6,
                            "acceptance_criteria": "API design documented, endpoints defined, data models approved",
                        },
                        {
                            "title": "Database setup and models",
                            "description": "Set up database, create models, and implement migrations",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Database configured, models created, migrations working",
                        },
                        {
                            "title": "Authentication system",
                            "description": "Implement JWT authentication and authorization",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Authentication working, JWT tokens secure, role-based access implemented",
                        },
                    ],
                },
                {
                    "name": "Core Endpoints",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "CRUD endpoints implementation",
                            "description": "Implement all CRUD operations for main resources",
                            "estimated_hours": 16,
                            "acceptance_criteria": "All CRUD endpoints functional, validated, and tested",
                        },
                        {
                            "title": "Business logic and services",
                            "description": "Implement business logic, validation, and service layer",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Business logic implemented, validation working, services tested",
                        },
                    ],
                },
                {
                    "name": "Documentation & Testing",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "API documentation",
                            "description": "Create comprehensive API documentation with examples",
                            "estimated_hours": 6,
                            "acceptance_criteria": "API documented, examples provided, interactive docs available",
                        },
                        {
                            "title": "Testing and deployment",
                            "description": "Write tests and deploy to production",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Tests passing, API deployed, monitoring configured",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "E-commerce Website",
        "description": "Online store with product catalog, shopping cart, and payment processing",
        "category": "ecommerce",
        "template_type": "code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 75.00,
            "default_change_request_rate": 100.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Store Setup",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Product catalog system",
                            "description": "Build product management, categories, and inventory system",
                            "estimated_hours": 14,
                            "acceptance_criteria": "Product CRUD working, categories functional, inventory tracking implemented",
                        },
                        {
                            "title": "User authentication and accounts",
                            "description": "Implement customer registration, login, and account management",
                            "estimated_hours": 10,
                            "acceptance_criteria": "User accounts working, authentication secure, profile management functional",
                        },
                    ],
                },
                {
                    "name": "Shopping Experience",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Shopping cart and checkout",
                            "description": "Build shopping cart, checkout flow, and order processing",
                            "estimated_hours": 18,
                            "acceptance_criteria": "Cart functional, checkout smooth, orders processed correctly",
                        },
                        {
                            "title": "Payment integration",
                            "description": "Integrate payment gateway (Stripe/PayPal/Paystack)",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Payments processing, webhooks working, refunds functional",
                        },
                    ],
                },
                {
                    "name": "Store Management",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Admin dashboard",
                            "description": "Build admin panel for order and product management",
                            "estimated_hours": 16,
                            "acceptance_criteria": "Admin can manage products, view orders, process refunds",
                        },
                        {
                            "title": "Email notifications",
                            "description": "Implement order confirmation and shipping notification emails",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Emails sending correctly, templates professional, tracking links working",
                        },
                    ],
                },
                {
                    "name": "Launch",
                    "order": 4,
                    "deliverables": [
                        {
                            "title": "Testing and optimization",
                            "description": "Test checkout flow, optimize performance, fix bugs",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Checkout tested, performance optimized, critical bugs fixed",
                        },
                        {
                            "title": "Production deployment",
                            "description": "Deploy store to production with SSL and monitoring",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Store live, SSL configured, payment gateway in production mode",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Dashboard & Analytics",
        "description": "Data visualization dashboard with charts and reporting features",
        "category": "analytics",
        "template_type": "code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 105.00,
            "default_change_request_rate": 155.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Data Integration",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Data Pipeline",
                            "description": "Set up data collection and processing pipeline",
                            "estimated_hours": 20,
                            "acceptance_criteria": "Data flowing correctly from sources",
                        },
                        {
                            "title": "Database Setup",
                            "description": "Configure analytics database and queries",
                            "estimated_hours": 15,
                            "acceptance_criteria": "Optimized queries for analytics",
                        },
                    ],
                },
                {
                    "name": "Visualization",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Charts & Graphs",
                            "description": "Create interactive visualizations using Chart.js/D3",
                            "estimated_hours": 35,
                            "acceptance_criteria": "All charts working and interactive",
                        },
                        {
                            "title": "Dashboard Layout",
                            "description": "Build responsive dashboard interface",
                            "estimated_hours": 25,
                            "acceptance_criteria": "Responsive dashboard with widgets",
                        },
                        {
                            "title": "Real-time Updates",
                            "description": "Implement live data updates",
                            "estimated_hours": 20,
                            "acceptance_criteria": "Dashboard updates in real-time",
                        },
                    ],
                },
                {
                    "name": "Reporting",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Report Generation",
                            "description": "Build custom report builder",
                            "estimated_hours": 25,
                            "acceptance_criteria": "Users can create custom reports",
                        },
                        {
                            "title": "Export Functionality",
                            "description": "Add PDF and CSV export options",
                            "estimated_hours": 15,
                            "acceptance_criteria": "Reports exportable in multiple formats",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "CMS Development",
        "description": "Content management system with user roles and permissions",
        "category": "cms",
        "template_type": "code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 100.00,
            "default_change_request_rate": 150.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Content Management",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Content Editor",
                            "description": "Build rich text editor with media upload",
                            "estimated_hours": 25,
                            "acceptance_criteria": "Functional WYSIWYG editor",
                        },
                        {
                            "title": "Content Types",
                            "description": "Create flexible content type system",
                            "estimated_hours": 20,
                            "acceptance_criteria": "Multiple content types supported",
                        },
                        {
                            "title": "Media Library",
                            "description": "Implement media management system",
                            "estimated_hours": 20,
                            "acceptance_criteria": "Complete media library with upload",
                        },
                    ],
                },
                {
                    "name": "User Management",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "User Roles & Permissions",
                            "description": "Implement role-based access control",
                            "estimated_hours": 25,
                            "acceptance_criteria": "Granular permission system working",
                        },
                        {
                            "title": "User Interface",
                            "description": "Build user management dashboard",
                            "estimated_hours": 20,
                            "acceptance_criteria": "Complete user management UI",
                        },
                    ],
                },
                {
                    "name": "Publishing & Workflow",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Publishing System",
                            "description": "Implement draft, review, and publish workflow",
                            "estimated_hours": 25,
                            "acceptance_criteria": "Complete publishing workflow",
                        },
                        {
                            "title": "Version Control",
                            "description": "Add content versioning and rollback",
                            "estimated_hours": 20,
                            "acceptance_criteria": "Version history and restore working",
                        },
                        {
                            "title": "SEO Tools",
                            "description": "Build SEO optimization features",
                            "estimated_hours": 15,
                            "acceptance_criteria": "SEO meta tags and sitemap generation",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "WordPress Website",
        "description": "Complete WordPress website setup with theme customization and content creation",
        "category": "no_code",
        "template_type": "no-code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 75.00,
            "default_change_request_rate": 110.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Setup & Configuration",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "WordPress Installation",
                            "description": "Install WordPress, configure hosting, and set up SSL",
                            "estimated_hours": 5,
                            "acceptance_criteria": "WordPress site accessible and secure",
                        },
                        {
                            "title": "Theme Selection & Setup",
                            "description": "Choose and configure WordPress theme",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Theme installed and basic customization complete",
                        },
                        {
                            "title": "Essential Plugins",
                            "description": "Install and configure necessary plugins (SEO, security, forms)",
                            "estimated_hours": 6,
                            "acceptance_criteria": "All essential plugins configured",
                        },
                    ],
                },
                {
                    "name": "Design & Content",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Page Design",
                            "description": "Design and build all main pages using page builder",
                            "estimated_hours": 20,
                            "acceptance_criteria": "All pages designed and responsive",
                        },
                        {
                            "title": "Content Creation",
                            "description": "Add and format content for all pages",
                            "estimated_hours": 15,
                            "acceptance_criteria": "All content added with proper formatting",
                        },
                        {
                            "title": "Media Optimization",
                            "description": "Optimize and upload images and media",
                            "estimated_hours": 8,
                            "acceptance_criteria": "All media optimized and properly displayed",
                        },
                    ],
                },
                {
                    "name": "Launch & Training",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Testing & Optimization",
                            "description": "Test site functionality and optimize performance",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Site fully functional and optimized",
                        },
                        {
                            "title": "Client Training",
                            "description": "Train client on WordPress admin and content management",
                            "estimated_hours": 5,
                            "acceptance_criteria": "Client comfortable managing site",
                        },
                        {
                            "title": "Launch & Handoff",
                            "description": "Final launch and documentation handoff",
                            "estimated_hours": 4,
                            "acceptance_criteria": "Site live with complete documentation",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Webflow Website",
        "description": "Custom Webflow website with animations and CMS integration",
        "category": "no_code",
        "template_type": "no-code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 85.00,
            "default_change_request_rate": 125.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Design & Structure",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Site Structure",
                            "description": "Plan site architecture and page structure in Webflow",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Site structure approved",
                        },
                        {
                            "title": "Visual Design",
                            "description": "Design all pages with Webflow Designer",
                            "estimated_hours": 25,
                            "acceptance_criteria": "All pages designed and responsive",
                        },
                        {
                            "title": "Interactions & Animations",
                            "description": "Add Webflow interactions and animations",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Smooth animations implemented",
                        },
                    ],
                },
                {
                    "name": "CMS & Content",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "CMS Setup",
                            "description": "Configure Webflow CMS collections and fields",
                            "estimated_hours": 10,
                            "acceptance_criteria": "CMS structure complete",
                        },
                        {
                            "title": "Content Population",
                            "description": "Add content to CMS and static pages",
                            "estimated_hours": 15,
                            "acceptance_criteria": "All content added and formatted",
                        },
                        {
                            "title": "Forms & Integrations",
                            "description": "Set up forms and third-party integrations",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Forms working and integrated",
                        },
                    ],
                },
                {
                    "name": "Launch & Optimization",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "SEO Optimization",
                            "description": "Configure SEO settings and meta tags",
                            "estimated_hours": 6,
                            "acceptance_criteria": "SEO fully optimized",
                        },
                        {
                            "title": "Performance Testing",
                            "description": "Test and optimize site performance",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Site loads quickly on all devices",
                        },
                        {
                            "title": "Client Training & Launch",
                            "description": "Train client on Webflow Editor and publish site",
                            "estimated_hours": 5,
                            "acceptance_criteria": "Site live and client trained",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Wix Business Site",
        "description": "Professional business website using Wix with booking and e-commerce features",
        "category": "no_code",
        "template_type": "no-code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 70.00,
            "default_change_request_rate": 105.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Site Setup",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Template Selection",
                            "description": "Choose and customize Wix template",
                            "estimated_hours": 5,
                            "acceptance_criteria": "Template selected and customized",
                        },
                        {
                            "title": "Branding & Design",
                            "description": "Apply brand colors, fonts, and logo",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Consistent branding throughout site",
                        },
                        {
                            "title": "Page Creation",
                            "description": "Build all necessary pages",
                            "estimated_hours": 15,
                            "acceptance_criteria": "All pages created and designed",
                        },
                    ],
                },
                {
                    "name": "Features & Functionality",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Contact Forms",
                            "description": "Set up contact and inquiry forms",
                            "estimated_hours": 4,
                            "acceptance_criteria": "Forms working and sending notifications",
                        },
                        {
                            "title": "Booking System",
                            "description": "Configure Wix Bookings for appointments",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Booking system functional",
                        },
                        {
                            "title": "E-commerce Setup",
                            "description": "Set up Wix Stores with products and payment",
                            "estimated_hours": 12,
                            "acceptance_criteria": "Store operational with payment processing",
                        },
                    ],
                },
                {
                    "name": "Launch & Support",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Mobile Optimization",
                            "description": "Optimize site for mobile devices",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Site fully responsive",
                        },
                        {
                            "title": "SEO Setup",
                            "description": "Configure Wix SEO settings",
                            "estimated_hours": 5,
                            "acceptance_criteria": "SEO optimized",
                        },
                        {
                            "title": "Training & Launch",
                            "description": "Train client and publish site",
                            "estimated_hours": 4,
                            "acceptance_criteria": "Site live and client trained",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Shopify E-commerce Store",
        "description": "Complete Shopify store setup with product listings and payment integration",
        "category": "no_code",
        "template_type": "no-code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 80.00,
            "default_change_request_rate": 120.00,
            "max_revisions": 2,
            "milestones": [
                {
                    "name": "Store Setup",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Shopify Configuration",
                            "description": "Set up Shopify account and basic settings",
                            "estimated_hours": 5,
                            "acceptance_criteria": "Store configured with domain",
                        },
                        {
                            "title": "Theme Customization",
                            "description": "Customize Shopify theme to match brand",
                            "estimated_hours": 15,
                            "acceptance_criteria": "Theme fully customized",
                        },
                        {
                            "title": "Payment & Shipping",
                            "description": "Configure payment gateways and shipping options",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Payment and shipping working",
                        },
                    ],
                },
                {
                    "name": "Product Setup",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "Product Listings",
                            "description": "Add products with descriptions and images",
                            "estimated_hours": 20,
                            "acceptance_criteria": "All products listed with details",
                        },
                        {
                            "title": "Collections & Categories",
                            "description": "Organize products into collections",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Products organized logically",
                        },
                        {
                            "title": "Inventory Management",
                            "description": "Set up inventory tracking",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Inventory system operational",
                        },
                    ],
                },
                {
                    "name": "Launch & Marketing",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Marketing Apps",
                            "description": "Install and configure marketing apps",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Marketing tools integrated",
                        },
                        {
                            "title": "Testing & Optimization",
                            "description": "Test checkout process and optimize",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Store fully functional",
                        },
                        {
                            "title": "Training & Launch",
                            "description": "Train client on Shopify admin",
                            "estimated_hours": 5,
                            "acceptance_criteria": "Store live and client trained",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Squarespace Portfolio",
        "description": "Creative portfolio website using Squarespace with gallery and blog",
        "category": "no_code",
        "template_type": "no-code",
        "is_system_template": True,
        "template_data": {
            "default_hourly_rate": 75.00,
            "default_change_request_rate": 110.00,
            "max_revisions": 3,
            "milestones": [
                {
                    "name": "Design & Layout",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Template Selection",
                            "description": "Choose and customize Squarespace template",
                            "estimated_hours": 6,
                            "acceptance_criteria": "Template selected and customized",
                        },
                        {
                            "title": "Portfolio Pages",
                            "description": "Design portfolio and project pages",
                            "estimated_hours": 15,
                            "acceptance_criteria": "Portfolio pages complete",
                        },
                        {
                            "title": "Gallery Setup",
                            "description": "Create image galleries with lightbox",
                            "estimated_hours": 10,
                            "acceptance_criteria": "Galleries functional and beautiful",
                        },
                    ],
                },
                {
                    "name": "Content & Features",
                    "order": 2,
                    "deliverables": [
                        {
                            "title": "About & Contact",
                            "description": "Build about page and contact form",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Pages complete with working form",
                        },
                        {
                            "title": "Blog Setup",
                            "description": "Configure blog with categories",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Blog operational",
                        },
                        {
                            "title": "Content Population",
                            "description": "Add all content and media",
                            "estimated_hours": 12,
                            "acceptance_criteria": "All content added",
                        },
                    ],
                },
                {
                    "name": "Polish & Launch",
                    "order": 3,
                    "deliverables": [
                        {
                            "title": "Mobile Optimization",
                            "description": "Optimize for mobile viewing",
                            "estimated_hours": 8,
                            "acceptance_criteria": "Fully responsive",
                        },
                        {
                            "title": "SEO & Analytics",
                            "description": "Set up SEO and Google Analytics",
                            "estimated_hours": 5,
                            "acceptance_criteria": "SEO and tracking configured",
                        },
                        {
                            "title": "Launch & Training",
                            "description": "Publish site and train client",
                            "estimated_hours": 4,
                            "acceptance_criteria": "Site live and client trained",
                        },
                    ],
                },
            ],
        },
    },
]


def get_system_templates():
    """Return all system templates."""
    return SYSTEM_TEMPLATES


def get_template_by_category(category: str):
    """Get system templates by category."""
    return [t for t in SYSTEM_TEMPLATES if t["category"] == category]
