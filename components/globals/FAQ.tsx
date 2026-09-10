import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#root/components/ui/accordion";

// FAQ data structure for easy editing
const defaultFaqData = [
  {
    id: "how-it-works",
    question: "How does our store work?",
    answer:
      "Browse our curated collections, add items to your cart, and checkout seamlessly. We offer a wide range of products with secure payments and fast shipping.",
  },
  {
    id: "payment-methods",
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards, debit cards, PayPal, and Apple Pay. All transactions are secure and encrypted to ensure your financial information is protected.",
  },
  {
    id: "shipping-time",
    question: "How long does shipping take?",
    answer:
      "Shipping times depend on your location. Typically, domestic orders are delivered within 3-5 business days, while international shipping can take 7-14 business days. You can view the estimated shipping time for each product on its page.",
  },
  {
    id: "return-policy",
    question: "What is your return policy?",
    answer:
      "We offer a 30-day return policy for most items. Products must be unworn, unwashed, and in their original packaging with tags attached. Specific return details for each product will be noted on their product pages.",
  },
  {
    id: "track-order",
    question: "How do I track my order?",
    answer:
      "Once your order ships, you'll receive a tracking number via email. You can also track your order in your account dashboard under 'Order History'.",
  },
  {
    id: "international-shipping",
    question: "Do you ship internationally?",
    answer:
      "Yes, we ship to many countries worldwide. International shipping rates and delivery times vary by location. You can view available shipping options during checkout.",
  },
];

interface FAQProps {
  title?: string;
  description?: string;
  faqs?: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
  backgroundColor?: string;
}

export const FAQ: React.FC<FAQProps> = ({
  title = "Frequently Asked Questions",
  description = "Find answers to common questions about shopping with us",
  faqs = defaultFaqData,
  backgroundColor = "bg-white",
}) => {
  return (
    <section id='faq' className={`py-20 ${backgroundColor}`}>
      <div className='container mx-auto px-4'>
        <div className='text-center mb-12'>
          <h2 className='text-3xl font-bold mb-4'>{title}</h2>
          <p className='text-gray-600 max-w-2xl mx-auto'>{description}</p>
        </div>

        <div className='max-w-3xl mx-auto'>
          <Accordion type='single' collapsible className='w-full space-y-6'>
            {faqs.map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className='border border-gray-200 rounded-lg p-2 shadow-sm'>
                <AccordionTrigger className='text-lg font-medium px-4 py-3 hover:no-underline'>
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className='text-gray-600 px-4'>
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};
