import { ProjectTemplate } from '../services/templates';

/**
 * Frontend-only project templates
 * These templates are used in the Templates tab to apply to existing projects
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'system-web-dev-001',
    user_id: null,
    name: 'Web Development',
    description: 'Standard web development workflow with design, development, and deployment phases',
    category: 'Web',
    template_type: 'code',
    template_data: {
      default_hourly_rate: 100,
      default_change_request_rate: 150,
      max_revisions: 3,
      milestones: [
        {
          name: 'Design Phase',
          order: 1,
          deliverables: [
            {
              title: 'UI/UX Design',
              description: 'Create wireframes and mockups for all major pages',
              estimated_hours: 20,
              acceptance_criteria: 'Approved designs with client sign-off'
            },
            {
              title: 'Design System',
              description: 'Establish color palette, typography, and component library',
              estimated_hours: 15,
              acceptance_criteria: 'Complete design system documentation'
            }
          ]
        },
        {
          name: 'Development Phase',
          order: 2,
          deliverables: [
            {
              title: 'Frontend Development',
              description: 'Build responsive UI components and pages',
              estimated_hours: 40,
              acceptance_criteria: 'Working frontend matching designs'
            },
            {
              title: 'Backend API',
              description: 'Develop RESTful API endpoints',
              estimated_hours: 35,
              acceptance_criteria: 'All API endpoints functional and documented'
            },
            {
              title: 'Database Setup',
              description: 'Design and implement database schema',
              estimated_hours: 20,
              acceptance_criteria: 'Database operational with migrations'
            }
          ]
        },
        {
          name: 'Testing & Deployment',
          order: 3,
          deliverables: [
            {
              title: 'Quality Assurance',
              description: 'Comprehensive testing across browsers and devices',
              estimated_hours: 25,
              acceptance_criteria: 'All tests passing, no critical bugs'
            },
            {
              title: 'Production Deployment',
              description: 'Deploy to production environment',
              estimated_hours: 10,
              acceptance_criteria: 'Live site accessible and functional'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-mobile-app-002',
    user_id: null,
    name: 'Mobile App Development',
    description: 'Complete mobile app development lifecycle from planning to deployment',
    category: 'Mobile',
    template_type: 'code',
    template_data: {
      default_hourly_rate: 120,
      default_change_request_rate: 180,
      max_revisions: 2,
      milestones: [
        {
          name: 'Planning & Design',
          order: 1,
          deliverables: [
            {
              title: 'App Architecture',
              description: 'Define app structure, navigation flow, and technical stack',
              estimated_hours: 15,
              acceptance_criteria: 'Approved architecture document'
            },
            {
              title: 'UI/UX Design',
              description: 'Create mobile-optimized designs for iOS and Android',
              estimated_hours: 30,
              acceptance_criteria: 'Approved designs for all screens'
            }
          ]
        },
        {
          name: 'Core Development',
          order: 2,
          deliverables: [
            {
              title: 'Authentication System',
              description: 'Implement user registration, login, and session management',
              estimated_hours: 25,
              acceptance_criteria: 'Secure authentication working'
            },
            {
              title: 'Main Features',
              description: 'Build core app functionality',
              estimated_hours: 60,
              acceptance_criteria: 'All primary features operational'
            },
            {
              title: 'API Integration',
              description: 'Connect to backend services and third-party APIs',
              estimated_hours: 20,
              acceptance_criteria: 'All integrations functional'
            }
          ]
        },
        {
          name: 'Testing & Launch',
          order: 3,
          deliverables: [
            {
              title: 'Testing & Bug Fixes',
              description: 'Comprehensive testing on multiple devices',
              estimated_hours: 30,
              acceptance_criteria: 'App stable with no critical issues'
            },
            {
              title: 'App Store Submission',
              description: 'Prepare and submit to iOS App Store and Google Play',
              estimated_hours: 15,
              acceptance_criteria: 'App approved and published'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-ecommerce-003',
    user_id: null,
    name: 'E-commerce Platform',
    description: 'Full-featured e-commerce solution with payment integration and admin panel',
    category: 'E-commerce',
    template_type: 'code',
    template_data: {
      default_hourly_rate: 110,
      default_change_request_rate: 165,
      max_revisions: 3,
      milestones: [
        {
          name: 'Core Features',
          order: 1,
          deliverables: [
            {
              title: 'Product Catalog',
              description: 'Build product listing, filtering, and details pages',
              estimated_hours: 30,
              acceptance_criteria: 'Functional product catalog with search'
            },
            {
              title: 'Shopping Cart',
              description: 'Implement cart functionality with quantity management',
              estimated_hours: 25,
              acceptance_criteria: 'Working cart system with persistence'
            },
            {
              title: 'User Accounts',
              description: 'Customer registration, login, and profile management',
              estimated_hours: 20,
              acceptance_criteria: 'Complete user account system'
            }
          ]
        },
        {
          name: 'Payment & Checkout',
          order: 2,
          deliverables: [
            {
              title: 'Checkout Process',
              description: 'Multi-step checkout with address and shipping options',
              estimated_hours: 30,
              acceptance_criteria: 'Smooth checkout flow'
            },
            {
              title: 'Payment Integration',
              description: 'Integrate Stripe/PayPal payment processing',
              estimated_hours: 25,
              acceptance_criteria: 'Secure payment processing working'
            },
            {
              title: 'Order Management',
              description: 'Order tracking and history for customers',
              estimated_hours: 20,
              acceptance_criteria: 'Complete order management system'
            }
          ]
        },
        {
          name: 'Admin Panel',
          order: 3,
          deliverables: [
            {
              title: 'Product Management',
              description: 'Admin interface for managing products and inventory',
              estimated_hours: 25,
              acceptance_criteria: 'Full product CRUD operations'
            },
            {
              title: 'Order Processing',
              description: 'Admin tools for processing and fulfilling orders',
              estimated_hours: 20,
              acceptance_criteria: 'Complete order processing workflow'
            },
            {
              title: 'Analytics Dashboard',
              description: 'Sales reports and analytics for admin',
              estimated_hours: 15,
              acceptance_criteria: 'Working analytics dashboard'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-api-dev-004',
    user_id: null,
    name: 'API Development',
    description: 'RESTful API development with documentation and testing',
    category: 'Backend',
    template_type: 'code',
    template_data: {
      default_hourly_rate: 95,
      default_change_request_rate: 140,
      max_revisions: 2,
      milestones: [
        {
          name: 'API Design',
          order: 1,
          deliverables: [
            {
              title: 'API Specification',
              description: 'Create OpenAPI/Swagger documentation',
              estimated_hours: 10,
              acceptance_criteria: 'Complete API spec with all endpoints'
            },
            {
              title: 'Database Schema',
              description: 'Design database structure and relationships',
              estimated_hours: 15,
              acceptance_criteria: 'Approved database schema'
            }
          ]
        },
        {
          name: 'Implementation',
          order: 2,
          deliverables: [
            {
              title: 'Authentication & Authorization',
              description: 'Implement JWT-based auth system',
              estimated_hours: 20,
              acceptance_criteria: 'Secure auth system operational'
            },
            {
              title: 'Endpoint Development',
              description: 'Build all API endpoints with validation',
              estimated_hours: 50,
              acceptance_criteria: 'All endpoints functional and validated'
            },
            {
              title: 'Error Handling',
              description: 'Implement comprehensive error handling',
              estimated_hours: 10,
              acceptance_criteria: 'Proper error responses for all cases'
            }
          ]
        },
        {
          name: 'Testing & Documentation',
          order: 3,
          deliverables: [
            {
              title: 'Unit & Integration Tests',
              description: 'Write comprehensive test suite',
              estimated_hours: 25,
              acceptance_criteria: '80%+ code coverage'
            },
            {
              title: 'API Documentation',
              description: 'Complete API documentation with examples',
              estimated_hours: 15,
              acceptance_criteria: 'Full documentation published'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-dashboard-005',
    user_id: null,
    name: 'Dashboard & Analytics',
    description: 'Data visualization dashboard with charts and reporting features',
    category: 'Analytics',
    template_type: 'code',
    template_data: {
      default_hourly_rate: 105,
      default_change_request_rate: 155,
      max_revisions: 3,
      milestones: [
        {
          name: 'Data Integration',
          order: 1,
          deliverables: [
            {
              title: 'Data Pipeline',
              description: 'Set up data collection and processing pipeline',
              estimated_hours: 20,
              acceptance_criteria: 'Data flowing correctly from sources'
            },
            {
              title: 'Database Setup',
              description: 'Configure analytics database and queries',
              estimated_hours: 15,
              acceptance_criteria: 'Optimized queries for analytics'
            }
          ]
        },
        {
          name: 'Visualization',
          order: 2,
          deliverables: [
            {
              title: 'Charts & Graphs',
              description: 'Create interactive visualizations using Chart.js/D3',
              estimated_hours: 35,
              acceptance_criteria: 'All charts working and interactive'
            },
            {
              title: 'Dashboard Layout',
              description: 'Build responsive dashboard interface',
              estimated_hours: 25,
              acceptance_criteria: 'Responsive dashboard with widgets'
            },
            {
              title: 'Real-time Updates',
              description: 'Implement live data updates',
              estimated_hours: 20,
              acceptance_criteria: 'Dashboard updates in real-time'
            }
          ]
        },
        {
          name: 'Reporting',
          order: 3,
          deliverables: [
            {
              title: 'Report Generation',
              description: 'Build custom report builder',
              estimated_hours: 25,
              acceptance_criteria: 'Users can create custom reports'
            },
            {
              title: 'Export Functionality',
              description: 'Add PDF and CSV export options',
              estimated_hours: 15,
              acceptance_criteria: 'Reports exportable in multiple formats'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-cms-006',
    user_id: null,
    name: 'CMS Development',
    description: 'Content management system with user roles and permissions',
    category: 'CMS',
    template_type: 'code',
    template_data: {
      default_hourly_rate: 100,
      default_change_request_rate: 150,
      max_revisions: 3,
      milestones: [
        {
          name: 'Content Management',
          order: 1,
          deliverables: [
            {
              title: 'Content Editor',
              description: 'Build rich text editor with media upload',
              estimated_hours: 25,
              acceptance_criteria: 'Functional WYSIWYG editor'
            },
            {
              title: 'Content Types',
              description: 'Create flexible content type system',
              estimated_hours: 20,
              acceptance_criteria: 'Multiple content types supported'
            },
            {
              title: 'Media Library',
              description: 'Implement media management system',
              estimated_hours: 20,
              acceptance_criteria: 'Complete media library with upload'
            }
          ]
        },
        {
          name: 'User Management',
          order: 2,
          deliverables: [
            {
              title: 'User Roles & Permissions',
              description: 'Implement role-based access control',
              estimated_hours: 25,
              acceptance_criteria: 'Granular permission system working'
            },
            {
              title: 'User Interface',
              description: 'Build user management dashboard',
              estimated_hours: 20,
              acceptance_criteria: 'Complete user management UI'
            }
          ]
        },
        {
          name: 'Publishing & Workflow',
          order: 3,
          deliverables: [
            {
              title: 'Publishing System',
              description: 'Implement draft, review, and publish workflow',
              estimated_hours: 25,
              acceptance_criteria: 'Complete publishing workflow'
            },
            {
              title: 'Version Control',
              description: 'Add content versioning and rollback',
              estimated_hours: 20,
              acceptance_criteria: 'Version history and restore working'
            },
            {
              title: 'SEO Tools',
              description: 'Build SEO optimization features',
              estimated_hours: 15,
              acceptance_criteria: 'SEO meta tags and sitemap generation'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

/**
 * No-Code Platform Templates
 * These templates are designed for WordPress, Webflow, Wix, and other no-code platforms
 */
export const NO_CODE_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'system-wordpress-007',
    user_id: null,
    name: 'WordPress Website',
    description: 'Complete WordPress website setup with theme customization and content creation',
    category: 'No-Code',
    template_type: 'no-code',
    template_data: {
      default_hourly_rate: 75,
      default_change_request_rate: 110,
      max_revisions: 3,
      milestones: [
        {
          name: 'Setup & Configuration',
          order: 1,
          deliverables: [
            {
              title: 'WordPress Installation',
              description: 'Install WordPress, configure hosting, and set up SSL',
              estimated_hours: 5,
              acceptance_criteria: 'WordPress site accessible and secure'
            },
            {
              title: 'Theme Selection & Setup',
              description: 'Choose and configure WordPress theme',
              estimated_hours: 8,
              acceptance_criteria: 'Theme installed and basic customization complete'
            },
            {
              title: 'Essential Plugins',
              description: 'Install and configure necessary plugins (SEO, security, forms)',
              estimated_hours: 6,
              acceptance_criteria: 'All essential plugins configured'
            }
          ]
        },
        {
          name: 'Design & Content',
          order: 2,
          deliverables: [
            {
              title: 'Page Design',
              description: 'Design and build all main pages using page builder',
              estimated_hours: 20,
              acceptance_criteria: 'All pages designed and responsive'
            },
            {
              title: 'Content Creation',
              description: 'Add and format content for all pages',
              estimated_hours: 15,
              acceptance_criteria: 'All content added with proper formatting'
            },
            {
              title: 'Media Optimization',
              description: 'Optimize and upload images and media',
              estimated_hours: 8,
              acceptance_criteria: 'All media optimized and properly displayed'
            }
          ]
        },
        {
          name: 'Launch & Training',
          order: 3,
          deliverables: [
            {
              title: 'Testing & Optimization',
              description: 'Test site functionality and optimize performance',
              estimated_hours: 10,
              acceptance_criteria: 'Site fully functional and optimized'
            },
            {
              title: 'Client Training',
              description: 'Train client on WordPress admin and content management',
              estimated_hours: 5,
              acceptance_criteria: 'Client comfortable managing site'
            },
            {
              title: 'Launch & Handoff',
              description: 'Final launch and documentation handoff',
              estimated_hours: 4,
              acceptance_criteria: 'Site live with complete documentation'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-webflow-008',
    user_id: null,
    name: 'Webflow Website',
    description: 'Custom Webflow website with animations and CMS integration',
    category: 'No-Code',
    template_type: 'no-code',
    template_data: {
      default_hourly_rate: 85,
      default_change_request_rate: 125,
      max_revisions: 3,
      milestones: [
        {
          name: 'Design & Structure',
          order: 1,
          deliverables: [
            {
              title: 'Site Structure',
              description: 'Plan site architecture and page structure in Webflow',
              estimated_hours: 6,
              acceptance_criteria: 'Site structure approved'
            },
            {
              title: 'Visual Design',
              description: 'Design all pages with Webflow Designer',
              estimated_hours: 25,
              acceptance_criteria: 'All pages designed and responsive'
            },
            {
              title: 'Interactions & Animations',
              description: 'Add Webflow interactions and animations',
              estimated_hours: 12,
              acceptance_criteria: 'Smooth animations implemented'
            }
          ]
        },
        {
          name: 'CMS & Content',
          order: 2,
          deliverables: [
            {
              title: 'CMS Setup',
              description: 'Configure Webflow CMS collections and fields',
              estimated_hours: 10,
              acceptance_criteria: 'CMS structure complete'
            },
            {
              title: 'Content Population',
              description: 'Add content to CMS and static pages',
              estimated_hours: 15,
              acceptance_criteria: 'All content added and formatted'
            },
            {
              title: 'Forms & Integrations',
              description: 'Set up forms and third-party integrations',
              estimated_hours: 8,
              acceptance_criteria: 'Forms working and integrated'
            }
          ]
        },
        {
          name: 'Launch & Optimization',
          order: 3,
          deliverables: [
            {
              title: 'SEO Optimization',
              description: 'Configure SEO settings and meta tags',
              estimated_hours: 6,
              acceptance_criteria: 'SEO fully optimized'
            },
            {
              title: 'Performance Testing',
              description: 'Test and optimize site performance',
              estimated_hours: 8,
              acceptance_criteria: 'Site loads quickly on all devices'
            },
            {
              title: 'Client Training & Launch',
              description: 'Train client on Webflow Editor and publish site',
              estimated_hours: 5,
              acceptance_criteria: 'Site live and client trained'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-wix-009',
    user_id: null,
    name: 'Wix Business Site',
    description: 'Professional business website using Wix with booking and e-commerce features',
    category: 'No-Code',
    template_type: 'no-code',
    template_data: {
      default_hourly_rate: 70,
      default_change_request_rate: 105,
      max_revisions: 3,
      milestones: [
        {
          name: 'Site Setup',
          order: 1,
          deliverables: [
            {
              title: 'Template Selection',
              description: 'Choose and customize Wix template',
              estimated_hours: 5,
              acceptance_criteria: 'Template selected and customized'
            },
            {
              title: 'Branding & Design',
              description: 'Apply brand colors, fonts, and logo',
              estimated_hours: 10,
              acceptance_criteria: 'Consistent branding throughout site'
            },
            {
              title: 'Page Creation',
              description: 'Build all necessary pages',
              estimated_hours: 15,
              acceptance_criteria: 'All pages created and designed'
            }
          ]
        },
        {
          name: 'Features & Functionality',
          order: 2,
          deliverables: [
            {
              title: 'Contact Forms',
              description: 'Set up contact and inquiry forms',
              estimated_hours: 4,
              acceptance_criteria: 'Forms working and sending notifications'
            },
            {
              title: 'Booking System',
              description: 'Configure Wix Bookings for appointments',
              estimated_hours: 10,
              acceptance_criteria: 'Booking system functional'
            },
            {
              title: 'E-commerce Setup',
              description: 'Set up Wix Stores with products and payment',
              estimated_hours: 12,
              acceptance_criteria: 'Store operational with payment processing'
            }
          ]
        },
        {
          name: 'Launch & Support',
          order: 3,
          deliverables: [
            {
              title: 'Mobile Optimization',
              description: 'Optimize site for mobile devices',
              estimated_hours: 8,
              acceptance_criteria: 'Site fully responsive'
            },
            {
              title: 'SEO Setup',
              description: 'Configure Wix SEO settings',
              estimated_hours: 5,
              acceptance_criteria: 'SEO optimized'
            },
            {
              title: 'Training & Launch',
              description: 'Train client and publish site',
              estimated_hours: 4,
              acceptance_criteria: 'Site live and client trained'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-shopify-010',
    user_id: null,
    name: 'Shopify E-commerce Store',
    description: 'Complete Shopify store setup with product listings and payment integration',
    category: 'No-Code',
    template_type: 'no-code',
    template_data: {
      default_hourly_rate: 80,
      default_change_request_rate: 120,
      max_revisions: 2,
      milestones: [
        {
          name: 'Store Setup',
          order: 1,
          deliverables: [
            {
              title: 'Shopify Configuration',
              description: 'Set up Shopify account and basic settings',
              estimated_hours: 5,
              acceptance_criteria: 'Store configured with domain'
            },
            {
              title: 'Theme Customization',
              description: 'Customize Shopify theme to match brand',
              estimated_hours: 15,
              acceptance_criteria: 'Theme fully customized'
            },
            {
              title: 'Payment & Shipping',
              description: 'Configure payment gateways and shipping options',
              estimated_hours: 8,
              acceptance_criteria: 'Payment and shipping working'
            }
          ]
        },
        {
          name: 'Product Setup',
          order: 2,
          deliverables: [
            {
              title: 'Product Listings',
              description: 'Add products with descriptions and images',
              estimated_hours: 20,
              acceptance_criteria: 'All products listed with details'
            },
            {
              title: 'Collections & Categories',
              description: 'Organize products into collections',
              estimated_hours: 8,
              acceptance_criteria: 'Products organized logically'
            },
            {
              title: 'Inventory Management',
              description: 'Set up inventory tracking',
              estimated_hours: 6,
              acceptance_criteria: 'Inventory system operational'
            }
          ]
        },
        {
          name: 'Launch & Marketing',
          order: 3,
          deliverables: [
            {
              title: 'Marketing Apps',
              description: 'Install and configure marketing apps',
              estimated_hours: 8,
              acceptance_criteria: 'Marketing tools integrated'
            },
            {
              title: 'Testing & Optimization',
              description: 'Test checkout process and optimize',
              estimated_hours: 10,
              acceptance_criteria: 'Store fully functional'
            },
            {
              title: 'Training & Launch',
              description: 'Train client on Shopify admin',
              estimated_hours: 5,
              acceptance_criteria: 'Store live and client trained'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'system-squarespace-011',
    user_id: null,
    name: 'Squarespace Portfolio',
    description: 'Creative portfolio website using Squarespace with gallery and blog',
    category: 'No-Code',
    template_type: 'no-code',
    template_data: {
      default_hourly_rate: 75,
      default_change_request_rate: 110,
      max_revisions: 3,
      milestones: [
        {
          name: 'Design & Layout',
          order: 1,
          deliverables: [
            {
              title: 'Template Selection',
              description: 'Choose and customize Squarespace template',
              estimated_hours: 6,
              acceptance_criteria: 'Template selected and customized'
            },
            {
              title: 'Portfolio Pages',
              description: 'Design portfolio and project pages',
              estimated_hours: 15,
              acceptance_criteria: 'Portfolio pages complete'
            },
            {
              title: 'Gallery Setup',
              description: 'Create image galleries with lightbox',
              estimated_hours: 10,
              acceptance_criteria: 'Galleries functional and beautiful'
            }
          ]
        },
        {
          name: 'Content & Features',
          order: 2,
          deliverables: [
            {
              title: 'About & Contact',
              description: 'Build about page and contact form',
              estimated_hours: 8,
              acceptance_criteria: 'Pages complete with working form'
            },
            {
              title: 'Blog Setup',
              description: 'Configure blog with categories',
              estimated_hours: 8,
              acceptance_criteria: 'Blog operational'
            },
            {
              title: 'Content Population',
              description: 'Add all content and media',
              estimated_hours: 12,
              acceptance_criteria: 'All content added'
            }
          ]
        },
        {
          name: 'Polish & Launch',
          order: 3,
          deliverables: [
            {
              title: 'Mobile Optimization',
              description: 'Optimize for mobile viewing',
              estimated_hours: 8,
              acceptance_criteria: 'Fully responsive'
            },
            {
              title: 'SEO & Analytics',
              description: 'Set up SEO and Google Analytics',
              estimated_hours: 5,
              acceptance_criteria: 'SEO and tracking configured'
            },
            {
              title: 'Launch & Training',
              description: 'Publish site and train client',
              estimated_hours: 4,
              acceptance_criteria: 'Site live and client trained'
            }
          ]
        }
      ]
    },
    is_system_template: true,
    is_public: false,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
