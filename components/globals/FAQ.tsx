import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#root/components/ui/accordion";

// FAQ data structure for easy editing
/**
 * No default FAQs.
 *
 * These previously answered five questions with invented policy: PayPal and
 * Apple Pay as accepted payment methods, 3–5 day domestic and 7–14 day
 * international delivery, a 30-day return window, and "yes, we ship to many
 * countries worldwide" — which directly contradicts an Egypt-only store.
 * Every one of those is a business fact ZELI has not established.
 *
 * Callers pass real FAQs via the `faqs` prop (the product page reads them
 * from Dashboard > Settings). With none supplied the section renders nothing.
 */
const defaultFaqData: Array<{ id: string; question: string; answer: string }> =
  [];

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
  // Nothing to answer — render nothing rather than an empty accordion under
  // a "Frequently Asked Questions" heading.
  if (faqs.length === 0) return null;

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
