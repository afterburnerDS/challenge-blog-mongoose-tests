'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');


// this makes the expect syntax available throughout
// this module
const expect = chai.expect;

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');


chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo

function seedBlogData() {
    console.info('seeding BlogPost data');
    const seedData = [];
  
    for (let i=1; i<=10; i++) {
      seedData.push(generateBlogData());
    }
    // this will return a promise
    return BlogPost.insertMany(seedData);
  }


  // generate an object represnting a BlogPost.
// can be used to generate seed data for db
// or request.body data
function generateBlogData() {
    return {
      title: faker.name.title(),
      content: faker.lorem.paragraph(),
      author: {
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName(),
      },
    };
  }

  // this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure data from one test does not stick
// around for next one
function tearDownDb() {
    console.warn('Deleting database');
    return mongoose.connection.dropDatabase();
  }


  describe('Blogs API resource', function() {

    // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedBlogData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });


  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing blogs', function() {
      // strategy:
      //    1. get back all blogs returned by by GET request to `/blogs`
      //    2. prove res has right status, data type
      //    3. prove the number of restaurants we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          // so subsequent .then blocks can access response object
          res = _res;
          expect(res).to.have.status(200);
          // otherwise our db seeding didn't work
          expect(res.body.blogs).to.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          expect(res.body.blogs).to.have.length.of(count);
        });
    });


    it('should return blogs with right fields', function() {
      // Strategy: Get back all restaurants, and ensure they have expected keys

      let resBlog;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body.blogs).to.be.a('array');
          expect(res.body.blogs).to.have.length.of.at.least(1);

          res.body.blogs.forEach(function(BlogPost) {
            expect(BlogPost).to.be.a('object');
            expect(BlogPost).to.include.keys(
              'id', 'title', 'content', 'author');
          });
          resBlog = res.body.blogs[0];
          return BlogPost.findById(resBlog.id);
        })
        .then(function(BlogPost) {

          expect(resBlog.id).to.equal(BlogPost.id);
          expect(resBlog.title).to.equal(BlogPost.title);
          expect(resBlog.content).to.equal(BlogPost.content);
          expect(resBlog.author).to.equal(BlogPost.author);
        });
    });
  });


  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the restaurant we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new BlogPost', function() {

      const newBlog = generateBlogData();

      return chai.request(app)
        .post('/posts')
        .send(newBlog)
        .then(function(res) {
          expect(res).to.have.status(201);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body).to.include.keys(
            'id', 'title', 'content', 'author');
          expect(res.body.title).to.equal(newBlog.title);
          // cause Mongo should have created id on insertion
          expect(res.body.id).to.not.be.null;
          expect(res.body.content).to.equal(newBlog.content);
          expect(res.body.author).to.equal(newBlog.author);

          return BlogPost.findById(res.body.id);
        })
        .then(function(BlogPost) {
          expect(BlogPost.title).to.equal(newBlog.title);
          expect(BlogPost.content).to.equal(newBlog.content);
          expect(BlogPost.author).to.equal(newBlog.author);
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing BlogPost from db
    //  2. Make a PUT request to update that BlogPost
    //  3. Prove BlogPost returned by request contains data we sent
    //  4. Prove BlogPost in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        title: 'fofofofofofofof',
        content: 'futuristic fusion'
      };

      return BlogPost
        .findOne()
        .then(function(BlogPost) {
          updateData.id = BlogPost.id;

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${BlogPost.id}`)
            .send(updateData);
        })
        .then(function(res) {
          expect(res).to.have.status(204);

          return BlogPost.findById(updateData.id);
        })
        .then(function(BlogPost) {
          expect(BlogPost.title).to.equal(updateData.title);
          expect(BlogPost.content).to.equal(updateData.content);
        });
    });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a restaurant
    //  2. make a DELETE request for that BlogPost's id
    //  3. assert that response has right status code
    //  4. prove that BlogPost with the id doesn't exist in db anymore
    it('delete a BlogPost by id', function() {

      let blogpost;

      return BlogPost
        .findOne()
        .then(function(_blog) {
            blogpost = _blog;
          return chai.request(app).delete(`/posts/${blogpost.id}`);
        })
        .then(function(res) {
          expect(res).to.have.status(204);
          return BlogPost.findById(BlogPost.id);
        })
        .then(function(_blog) {
          expect(_blog).to.be.null;
        });
    });
  });


  });