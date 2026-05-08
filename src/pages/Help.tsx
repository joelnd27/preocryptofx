import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  HelpCircle, 
  MessageSquare, 
  Mail, 
  Search, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Book,
  Shield,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import AlertModal from '../components/AlertModal';

export default function Help() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [search, setSearch] = useState('');
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'info' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const faqs = [
    {
      q: "How do the AI bots work?",
      a: "Our AI bots use advanced neural networks to analyze historical price data, volume, and social sentiment in real-time. They execute trades based on high-probability patterns identified by our proprietary algorithms."
    },
    {
      q: "Is my demo balance real money?",
      a: "No, the $10,000 balance is for simulation purposes only. It allows you to test our platform and AI bots without any financial risk."
    },
    {
      q: "How can I withdraw my profits?",
      a: "In this demo version, withdrawals are simulated. In the production version, you can withdraw to any major crypto wallet or bank account via our integrated payment gateways."
    },
    {
      q: "What is the minimum trade amount?",
      a: "The minimum trade amount is $10.00. This ensures that even small portfolios can benefit from our AI-driven strategies."
    },
    {
      q: "Are the crypto prices real?",
      a: "Yes, we use a real-time data feed from major exchanges to provide accurate pricing for all 20+ supported cryptocurrencies."
    }
  ];

  const filteredFaqs = faqs.filter(f => 
    f.q.toLowerCase().includes(search.toLowerCase()) || 
    f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-bold text-slate-900 dark:text-white">How can we help?</h2>
        <p className="text-slate-500 dark:text-slate-300">Search our knowledge base or contact our support team 24/7.</p>
        <div className="max-w-2xl mx-auto relative mt-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search for topics, questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all shadow-xl shadow-slate-200/50 dark:shadow-none"
          />
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Book, title: 'Documentation', desc: 'Detailed guides on bot strategies and platform features.', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-400/10' },
          { icon: Shield, title: 'Security', desc: 'Learn how we protect your assets and personal data.', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-400/10' },
          { icon: Zap, title: 'API Reference', desc: 'Connect your own tools to our high-speed trading API.', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-400/10' }
        ].map((item, i) => (
          <div key={i} className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-8 rounded-[32px] hover:border-blue-500/50 transition-all cursor-pointer group shadow-sm dark:shadow-none">
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform", item.bg, item.color)}>
              <item.icon size={28} />
            </div>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-slate-900 dark:text-white">
              {item.title} <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* FAQ Section */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-2xl font-bold mb-8 text-slate-900 dark:text-white">Frequently Asked Questions</h3>
          <div className="space-y-4">
            {filteredFaqs.map((faq, i) => (
              <div key={i} className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <span className="font-bold text-slate-900 dark:text-white">{faq.q}</span>
                  {openFaq === i ? <ChevronUp size={20} className="text-blue-600 dark:text-blue-400" /> : <ChevronDown size={20} className="text-slate-400 dark:text-slate-500" />}
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-6 pb-6 text-slate-600 dark:text-slate-300 text-sm leading-relaxed"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Form */}
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-8 rounded-[32px] shadow-sm dark:shadow-none">
            <h3 className="text-xl font-bold mb-6 text-slate-900 dark:text-white">Contact Support</h3>
            <form className="space-y-4" onSubmit={(e) => { 
              e.preventDefault(); 
              setAlertConfig({
                isOpen: true,
                title: 'Message Sent',
                message: 'Your message has been successfully sent to our support team. We will get back to you within 24 hours.',
                type: 'success'
              });
            }}>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Subject</label>
                <select className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all">
                  <option className="bg-white dark:bg-slate-900">General Inquiry</option>
                  <option className="bg-white dark:bg-slate-900">Technical Issue</option>
                  <option className="bg-white dark:bg-slate-900">Billing & Deposits</option>
                  <option className="bg-white dark:bg-slate-900">Bot Performance</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Message</label>
                <textarea
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all resize-none"
                  placeholder="How can we help you today?"
                ></textarea>
              </div>
              <button className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                <MessageSquare size={18} /> Send Message
              </button>
            </form>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 p-8 rounded-[32px]">
            <h4 className="font-bold mb-4">Direct Contact</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-slate-400 hover:text-white transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                  <Mail size={18} />
                </div>
                <span className="text-sm">support@preocrypto.com</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400 hover:text-white transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                  <MessageSquare size={18} />
                </div>
                <span className="text-sm">Live Chat (24/7)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Alert Modal */}
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </div>
  );
}
