-- DROP TABLES IF THEY ALREADY EXIST (optional, for re-runs)
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS surveys CASCADE;
DROP TABLE IF EXISTS registration CASCADE;
DROP TABLE IF EXISTS event_occurances CASCADE;
DROP TABLE IF EXISTS event_templates CASCADE;
DROP TABLE IF EXISTS participants CASCADE;

------------------------------------------------------------
-- PARTICIPANTS
------------------------------------------------------------
CREATE TABLE participants (
    ParticipantID INTEGER PRIMARY KEY,
    ParticipantEmail TEXT NOT NULL,
    ParticipantFirstName TEXT NOT NULL,
    ParticipantLastName TEXT NOT NULL,
    ParticipantDOB DATE,
    ParticipantRole TEXT,
    ParticipantPhone TEXT,
    ParticipantCity TEXT,
    ParticipantState TEXT,
    ParticipantZip INTEGER,
    ParticipantSchool TEXT,
    ParticipantEmployer TEXT,
    ParticipantFieldOfInterest TEXT,
    UNIQUE (ParticipantEmail)
);

------------------------------------------------------------
-- EVENT TEMPLATES
------------------------------------------------------------
CREATE TABLE event_templates (
    EventTemplateID INTEGER PRIMARY KEY,
    EventName TEXT NOT NULL,
    EventType TEXT,
    EventDescription TEXT,
    EventRecurrencePattern TEXT,
    EventDefaultCapacity INTEGER,
    UNIQUE (EventName)
);

------------------------------------------------------------
-- EVENT OCCURANCES  (spelled as in the CSV)
------------------------------------------------------------
CREATE TABLE event_occurances (
    EventOccurrenceID INTEGER PRIMARY KEY,
    EventTemplateID INTEGER NOT NULL,
    EventName TEXT NOT NULL,
    EventDateTimeStart TIMESTAMP NOT NULL,
    EventDateTimeEnd TIMESTAMP,
    EventLocation TEXT,
    EventCapacity INTEGER,
    EventRegistrationDeadline TIMESTAMP,
    FOREIGN KEY (EventTemplateID) REFERENCES event_templates(EventTemplateID)
);

------------------------------------------------------------
-- REGISTRATION
------------------------------------------------------------
CREATE TABLE registration (
    RegistrationID INTEGER PRIMARY KEY,
    ParticipantID INTEGER NOT NULL,
    EventOccurrenceID INTEGER NOT NULL,
    RegistrationStatus TEXT,
    RegistrationAttendedFlag BOOLEAN,
    RegistrationCheckInTime TIMESTAMP,
    RegistrationCreatedAt TIMESTAMP,
    FOREIGN KEY (ParticipantID) REFERENCES participants(ParticipantID),
    FOREIGN KEY (EventOccurrenceID) REFERENCES event_occurances(EventOccurrenceID)
);

------------------------------------------------------------
-- SURVEYS
------------------------------------------------------------
CREATE TABLE surveys (
    SurveyID INTEGER PRIMARY KEY,
    RegistrationID INTEGER NOT NULL,
    SurveySatisfactionScore NUMERIC,
    SurveyUsefulnessScore NUMERIC,
    SurveyInstructorScore NUMERIC,
    SurveyRecommendationScore NUMERIC,
    SurveyOverallScore NUMERIC,
    SurveyNPSBucket TEXT,
    SurveyComments TEXT,
    SurveySubmissionDate TIMESTAMP,
    FOREIGN KEY (RegistrationID) REFERENCES registration(RegistrationID)
);

------------------------------------------------------------
-- MILESTONES
------------------------------------------------------------
CREATE TABLE milestones (
    MilestoneID INTEGER PRIMARY KEY,
    ParticipantID INTEGER NOT NULL,
    MilestoneTitle TEXT NOT NULL,
    MilestoneDate DATE,
    FOREIGN KEY (ParticipantID) REFERENCES participants(ParticipantID)
);

------------------------------------------------------------
-- DONATIONS
------------------------------------------------------------
CREATE TABLE donations (
    DonationID INTEGER PRIMARY KEY,
    ParticipantID INTEGER NOT NULL,
    DonationDate DATE,
    DonationAmount NUMERIC,
    FOREIGN KEY (ParticipantID) REFERENCES participants(ParticipantID)
);