import React from 'react';
import { Calendar, Brain, Lock, Zap } from 'lucide-react';

const LandingPage = () => {
  return (
    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 min-h-screen text-white">
      <header className="container mx-auto py-8">
        <h1 className="text-4xl font-bold mb-2">The Hub: Digital Detox Camp</h1>
        <p className="text-xl">Realign Your Digital Life in Just One Week</p>
      </header>

      <main className="container mx-auto py-12">
        <section className="mb-12">
          <h2 className="text-3xl font-semibold mb-4">Regain Control. Rewire Your Habits. Rediscover Yourself.</h2>
          <p className="text-lg mb-4">
            In today's hyper-connected world, it's easy to lose yourself in the digital noise. Our week-long on-site camp is designed to help you break free from harmful digital habits and realign your actions with your goals.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white bg-opacity-10 p-6 rounded-lg">
            <Calendar className="w-12 h-12 mb-4 text-yellow-300" />
            <h3 className="text-xl font-semibold mb-2">7-Day Immersive Experience</h3>
            <p>A full week of structured activities, workshops, and personalized coaching to help you regain control over your digital life.</p>
          </div>
          <div className="bg-white bg-opacity-10 p-6 rounded-lg">
            <Brain className="w-12 h-12 mb-4 text-green-300" />
            <h3 className="text-xl font-semibold mb-2">Cognitive Rewiring</h3>
            <p>Learn techniques to align your thoughts, plans, and actions. Break free from executive dysfunction and digital addiction.</p>
          </div>
          <div className="bg-white bg-opacity-10 p-6 rounded-lg">
            <Lock className="w-12 h-12 mb-4 text-red-300" />
            <h3 className="text-xl font-semibold mb-2">Controlled Environment</h3>
            <p>A safe, distraction-free space where you can focus on your personal growth and development without digital interruptions.</p>
          </div>
          <div className="bg-white bg-opacity-10 p-6 rounded-lg">
            <Zap className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Practical Strategies</h3>
            <p>Develop a personalized action plan to maintain your digital well-being long after the camp ends.</p>
          </div>
        </section>

        <section className="text-center">
          <h2 className="text-3xl font-semibold mb-4">Ready to Reclaim Your Life?</h2>
          <button className="bg-yellow-500 text-gray-900 font-bold py-3 px-8 rounded-full text-lg hover:bg-yellow-400 transition duration-300">
            Apply Now
          </button>
          <p className="mt-4 text-sm">Limited spots available. Apply today to secure your place in our next camp session.</p>
        </section>
      </main>

      <footer className="container mx-auto py-8 text-center">
        <p>&copy; 2024 The Hub Digital Detox Camp. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
