import React from 'react'

export default function ServiceCard({ image, title, description, buttonText }) {
  return (
    <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow duration-300">
      <figure><img src={image} alt={title} className="h-48 w-full object-cover" /></figure>
      <div className="card-body">
        <h2 className="card-title text-secondary">{title}</h2>
        <p className="text-gray-600">{description}</p>
        <div className="card-actions justify-end mt-4">
          <button className="btn btn-outline btn-primary rounded-full px-6">{buttonText}</button>
        </div>
      </div>
    </div>
  )
}