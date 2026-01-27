import React from 'react';
import { HelpCircle, MessageCircle, FileText, Mail, Phone, ExternalLink } from 'lucide-react';

export default function SupportPage() {
  const supportOptions = [
    {
      title: 'Documentation',
      description: 'Browse our comprehensive guides and tutorials',
      icon: <FileText className="h-6 w-6" />,
      action: 'View Docs',
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Email Support',
      description: 'Get help from our support team via email',
      icon: <Mail className="h-6 w-6" />,
      action: 'Send Email',
      color: 'bg-fv-gold-soft text-fv-olive',
    },
    {
      title: 'Phone Support',
      description: 'Call us for immediate assistance',
      icon: <Phone className="h-6 w-6" />,
      action: 'Call Now',
      color: 'bg-fv-success/10 text-fv-success',
    },
    {
      title: 'Live Chat',
      description: 'Chat with our support agents in real-time',
      icon: <MessageCircle className="h-6 w-6" />,
      action: 'Start Chat',
      color: 'bg-fv-info/10 text-fv-info',
    },
  ];

  const faqs = [
    {
      question: 'How do I create a new project?',
      answer: 'Navigate to the Projects page and click "New Project". Fill in the required details including crop type, location, and budget.',
    },
    {
      question: 'How does the project selector work?',
      answer: 'The project selector in the top navbar allows you to switch between projects. All pages will automatically update to show data for the selected project.',
    },
    {
      question: 'Can I export my data?',
      answer: 'Yes, you can export data from the Reports page. Choose the report type and click Export to download as CSV or PDF.',
    },
    {
      question: 'How do I add team members?',
      answer: 'Go to the Employees page and click "Add Employee". You can assign roles and departments to each team member.',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Get help and find answers to your questions
        </p>
      </div>

      {/* Support Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {supportOptions.map((option) => (
          <div key={option.title} className="fv-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${option.color}`}>
                {option.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{option.title}</h3>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
              <button className="fv-btn fv-btn--secondary text-sm">
                {option.action}
                <ExternalLink className="h-3 w-3 ml-1" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FAQs */}
      <div className="fv-card">
        <div className="flex items-center gap-2 mb-6">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Frequently Asked Questions</h3>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-foreground mb-2">{faq.question}</h4>
              <p className="text-sm text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Info */}
      <div className="fv-card">
        <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">support@farmvault.com</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">+254 700 123 456</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
